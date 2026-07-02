import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { asegurarDirectoriosDatos, SETTINGS_FILE, DATA_DIR, STATE_FILE } from './paths.js';
import { Config } from './config.js';
import { log, rotarLogSiHaceFalta } from './logger.js';
import { SessionRegistry } from './watcher/session-registry.js';
import { localizarConReintentos } from './watcher/transcript-locator.js';
import { JsonlTailer } from './watcher/jsonl-tailer.js';
import { StatuslineIngest } from './watcher/statusline-ingest.js';
import { parsearEntrada } from './signals/turn-parser.js';
import { SessionState } from './signals/session-state.js';
import { extraerSenales } from './signals/feature-extractor.js';
import { recomendar } from './engine/heuristics.js';
import { consejos } from './engine/advice.js';
import { Clasificador } from './engine/classifier.js';
import { fusionar } from './engine/fusion.js';
import { NOMBRES_MODELO } from './engine/modelos.js';
import { programarStateFile } from './output/state-file.js';
import { Notificador } from './output/notifier.js';
import { anotarRecomendacion } from './output/history-store.js';
import { crearApp } from './server/http.js';
import { crearWs } from './server/ws.js';

const EDAD_MAX_PROMPT_MS = 90_000; // en arranque frío no recomendar sobre historial viejo

// ---------------------------------------------------------------------------

let esfuerzoCache = { valor: null, ts: 0 };
function leerEsfuerzoSettings() {
  if (Date.now() - esfuerzoCache.ts < 30_000) return esfuerzoCache.valor;
  let valor = null;
  try { valor = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')).effortLevel || null; } catch { /* sin settings */ }
  esfuerzoCache = { valor, ts: Date.now() };
  return valor;
}

function nuevoId() {
  return 'rec_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

async function main() {
  asegurarDirectoriosDatos();
  rotarLogSiHaceFalta();
  const config = new Config();
  log.info(`Asesor de uso de IA — arrancando (datos en ${DATA_DIR})`);

  const sesiones = new Map(); // sessionId → { info, estado, tailer }
  const registro = new SessionRegistry({ inactivoMs: (config.get().sesionInactivaMinutos ?? 10) * 60_000 });
  const ingest = new StatuslineIngest();
  const clasificador = new Clasificador(config);
  const notificador = new Notificador(config);

  // --- Serialización para dashboard / state file ---
  function serializarSesion(e) {
    return {
      sessionId: e.info.sessionId,
      cwd: e.estado.cwd || e.info.cwd,
      nombre: e.info.nombre,
      estado: e.info.estado,
      gitBranch: e.estado.gitBranch,
      modeloActual: e.estado.modeloActual,
      turnos: e.estado.turnos,
      tokens: e.estado.tokens,
      ctxPct: e.estado.statusline.ctxPct,
      cuota5h: e.estado.statusline.cuota5h,
      cuotaSemana: e.estado.statusline.cuotaSemana,
      transcript: Boolean(e.tailer),
      lineasMalas: e.tailer?.lineasMalas || 0,
      ultimaRec: e.estado.ultimaRec,
    };
  }

  function snapshot() {
    return {
      daemon: { pid: process.pid, puerto: config.get().puerto, arrancado: arrancadoEn },
      sessions: [...sesiones.values()].map(serializarSesion),
      config: config.get(),
      classifier: clasificador.estado(),
      esfuerzoConfigurado: leerEsfuerzoSettings(),
    };
  }

  function actualizarStateFile() {
    programarStateFile(() => {
      const sessions = {};
      for (const e of sesiones.values()) {
        const r = e.estado.ultimaRec;
        if (!r) continue;
        sessions[e.info.sessionId] = {
          nombre: e.info.nombre,
          recModelo: r.modelo,
          recEsfuerzo: r.esfuerzo,
          confianza: r.confianza,
          fuente: r.fuente,
          razonCorta: r.tipoTarea,
          modeloActual: r.actual?.modelo || null,
          difiere: r.coincide === false,
          consejos: (r.consejos || []).map((c) => c.texto),
          updatedAt: r.ts,
        };
      }
      return {
        v: 1,
        updatedAt: new Date().toISOString(),
        daemon: { pid: process.pid, puerto: config.get().puerto },
        sessions,
      };
    });
  }

  // --- Recomendación L1 rápida para el hook (<300 ms, sin capa 2) ---
  const promptsYaBloqueados = new Map(); // hash → ts (para dejar pasar el reenvío)
  function recomendarRapido(prompt, sessionId) {
    const entrada = sessionId ? sesiones.get(sessionId) : null;
    const estado = entrada ? entrada.estado : new SessionState(sessionId || 'hook');
    const senales = extraerSenales(prompt, estado, config.get(), leerEsfuerzoSettings());
    const l1 = recomendar(senales, config.get());
    const cons = consejos(senales, config.get());
    const nombre = NOMBRES_MODELO[l1.modelo] || l1.modelo;
    const extra = cons.length ? ` Además: ${cons.map((c) => c.texto).join('; ')}.` : '';

    // Modo puerta (opt-in): bloquear el prompt UNA vez si difiere con confianza alta.
    // El reenvío del mismo prompt dentro de la ventana pasa siempre (decisión del usuario).
    let bloquear = false;
    let motivoBloqueo = null;
    const puerta = config.get().hookBloqueo || {};
    const modeloActual = estado.modeloActual;
    if (puerta.activado && modeloActual && l1.modelo !== modeloActual
      && l1.confianza >= (puerta.umbralConfianza ?? 0.75)) {
      const hash = crypto.createHash('sha1')
        .update((sessionId || '') + '|' + prompt.toLowerCase().trim().replace(/\s+/g, ' '))
        .digest('hex');
      const ventanaMs = (puerta.ventanaRepeticionMinutos ?? 5) * 60_000;
      const antes = promptsYaBloqueados.get(hash);
      if (!antes || Date.now() - antes > ventanaMs) {
        promptsYaBloqueados.set(hash, Date.now());
        if (promptsYaBloqueados.size > 200) {
          for (const [k, ts] of promptsYaBloqueados) if (Date.now() - ts > ventanaMs) promptsYaBloqueados.delete(k);
        }
        bloquear = true;
        motivoBloqueo = `[Asesor IA] Prompt detenido ANTES de ejecutarse: esta tarea (${l1.tipoTarea.toLowerCase()}) encaja mejor con ${nombre}${l1.esfuerzo ? `/${l1.esfuerzo}` : ''} (confianza ${Math.round(l1.confianza * 100)}%) y estás usando ${NOMBRES_MODELO[modeloActual] || modeloActual}. Opciones: cambia con /model ${l1.modelo} y reenvía (la flecha ↑ recupera el prompt), o reenvíalo tal cual para seguir con tu modelo actual.`;
      }
    }

    return {
      texto: `[Asesor IA] Para esta tarea bastaría ${nombre}${l1.esfuerzo ? `/${l1.esfuerzo}` : ''} (confianza ${Math.round(l1.confianza * 100)}%). Motivo: ${l1.tipoTarea.toLowerCase()}.${extra} Si difiere del modelo en uso, menciónalo brevemente al usuario.`,
      rec: l1,
      consejos: cons,
      bloquear,
      motivoBloqueo,
    };
  }

  // --- Pipeline principal por sesión ---
  function publicar(rec, entrada) {
    entrada.estado.ultimaRec = rec;
    anotarRecomendacion({
      ...rec,
      senales: rec.senalesResumen,
      senalesResumen: undefined,
    });
    actualizarStateFile();
    wsApi.broadcast('recommendation', rec);
    notificador.notificar(rec, entrada.info.nombre);
  }

  function generarRecomendacion(entrada, ev) {
    const cfg = config.get();
    const senales = extraerSenales(ev.texto, entrada.estado, cfg, leerEsfuerzoSettings());
    const l1 = recomendar(senales, cfg);
    const cons = consejos(senales, cfg);
    const actual = { modelo: entrada.estado.modeloActual, esfuerzo: senales.esfuerzoActual };
    const coincideCon = (modelo) => (actual.modelo ? actual.modelo === modelo : null);
    const base = fusionar(l1, null);
    let rec = {
      id: nuevoId(),
      rev: 1,
      sessionId: entrada.info.sessionId,
      turnoUuid: ev.uuid || null,
      ts: new Date().toISOString(),
      ...base,
      consejos: cons,
      actual,
      coincide: coincideCon(base.modelo),
      senalesResumen: {
        palabras: senales.palabras,
        ficheros: senales.ficheros,
        densidadCodigo: senales.densidadCodigo,
        rachaErrores: senales.rachaErrores,
        ctxPct: senales.ctxPct,
        cuota5h: senales.cuota5h,
      },
    };
    entrada.ultimoTurno = ev.uuid || rec.id;
    publicar(rec, entrada);

    const puede = clasificador.puedeLlamar(senales, l1);
    if (!puede.ok) return;
    clasificador.clasificar(senales, l1).then((l2) => {
      if (!l2) return;
      if (entrada.ultimoTurno !== (ev.uuid || rec.id)) return; // llegó tarde: turno nuevo en curso
      const fusion = fusionar(l1, l2);
      rec = {
        ...rec,
        ...fusion,
        rev: 2,
        ts: new Date().toISOString(),
        coincide: coincideCon(fusion.modelo),
      };
      publicar(rec, entrada);
    }).catch(() => {});
  }

  let ultimoUpdateSesion = new Map();
  function broadcastSesion(entrada, forzar = false) {
    const ahora = Date.now();
    const ultimo = ultimoUpdateSesion.get(entrada.info.sessionId) || 0;
    if (!forzar && ahora - ultimo < 2000) return;
    ultimoUpdateSesion.set(entrada.info.sessionId, ahora);
    wsApi.broadcast('session_update', serializarSesion(entrada));
  }

  function procesarEntrada(entrada, cruda) {
    const ev = parsearEntrada(cruda);
    if (!ev) return;
    entrada.estado.aplicar(ev);
    if (ev.kind === 'prompt') {
      const edad = Date.now() - (Date.parse(ev.ts || '') || 0);
      if (edad < EDAD_MAX_PROMPT_MS) generarRecomendacion(entrada, ev);
      broadcastSesion(entrada, true);
    } else if (ev.kind === 'assistant') {
      broadcastSesion(entrada);
    }
  }

  async function conectarSesion(info) {
    const existente = sesiones.get(info.sessionId);
    if (existente) {
      existente.info = info;
      broadcastSesion(existente);
      return;
    }
    const entrada = { info, estado: new SessionState(info.sessionId), tailer: null, ultimoTurno: null };
    sesiones.set(info.sessionId, entrada);
    log.info(`sesión detectada: ${info.sessionId.slice(0, 8)} (${info.nombre})`);
    broadcastSesion(entrada, true);
    const ruta = await localizarConReintentos(info.sessionId, { sigueViva: () => sesiones.has(info.sessionId) });
    if (!ruta || !sesiones.has(info.sessionId)) {
      if (!ruta) log.warn(`sin transcript para ${info.sessionId.slice(0, 8)}`);
      return;
    }
    const tailer = new JsonlTailer(ruta);
    entrada.tailer = tailer;
    tailer.on('entrada', (e) => {
      try { procesarEntrada(entrada, e); } catch (err) { log.warn(`procesando entrada: ${err.message}`); }
    });
    await tailer.start();
    log.info(`tail activo: ${info.sessionId.slice(0, 8)} → ${ruta}`);
    broadcastSesion(entrada, true);
  }

  registro.on('nueva', (info) => { conectarSesion(info).catch((e) => log.warn(`conectando sesión: ${e.message}`)); });
  registro.on('actualizada', (info) => {
    const entrada = sesiones.get(info.sessionId);
    if (entrada) { entrada.info = info; broadcastSesion(entrada); }
    else conectarSesion(info).catch(() => {});
  });
  registro.on('cerrada', async (sessionId) => {
    const entrada = sesiones.get(sessionId);
    if (!entrada) return;
    sesiones.delete(sessionId);
    if (entrada.tailer) await entrada.tailer.stop().catch?.(() => {});
    log.info(`sesión cerrada: ${sessionId.slice(0, 8)}`);
    wsApi.broadcast('session_closed', { sessionId });
    actualizarStateFile();
  });

  ingest.on('datos', (d) => {
    const entrada = sesiones.get(d.sessionId);
    if (!entrada) return;
    entrada.estado.aplicarStatusline(d);
    broadcastSesion(entrada);
  });

  clasificador.on('breaker', (estado) => wsApi.broadcast('classifier_status', estado));

  // --- Servidor ---
  const app = crearApp({ config, snapshot, broadcast: (t, p) => wsApi.broadcast(t, p), recomendarRapido, notificador });
  const server = http.createServer(app);
  const wsApi = crearWs(server, snapshot);
  const puerto = config.get().puerto;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(puerto, '127.0.0.1', resolve);
  });
  const arrancadoEn = new Date().toISOString();
  log.info(`dashboard en http://localhost:${puerto}`);

  clasificador.smokeTest();
  await registro.start();
  await ingest.start();
  actualizarStateFile();

  const apagar = async () => {
    log.info('apagando…');
    try {
      await registro.stop();
      await ingest.stop();
      for (const e of sesiones.values()) if (e.tailer) await e.tailer.stop();
      wsApi.close();
      server.close();
      fs.rmSync(STATE_FILE, { force: true }); // que el statusline degrade al momento
    } catch { /* mejor esfuerzo */ }
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

main().catch((e) => {
  log.error(`fallo fatal: ${e.stack || e}`);
  process.exit(1);
});
