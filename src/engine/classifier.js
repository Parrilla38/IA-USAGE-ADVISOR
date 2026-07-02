import { spawn, exec } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLASSIFIER_CWD } from '../paths.js';
import { construirPrompt } from './classifier-prompt.js';
import { NIVELES_MODELO, NIVELES_ESFUERZO } from './modelos.js';
import { log } from '../logger.js';

const RE_MODELO_SEGURO = /^[\w.\-[\]]+$/;

/**
 * CAPA 2: clasificador vía `claude -p` headless (Haiku, usa la suscripción).
 * Protecciones: umbral de invocación, caché por hash, rate-limit propio,
 * timeout y circuit breaker. El prompt viaja por stdin (nada de contenido de
 * usuario en la línea de comandos).
 */
export class Clasificador extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.cache = new Map(); // hash → { rec, ts }
    this.llamadas = []; // timestamps de llamadas recientes
    this.fallosSeguidos = 0;
    this.abiertoHasta = 0;
    this.cliVersion = null;
  }

  estado() {
    return {
      estado: Date.now() < this.abiertoHasta ? 'abierto' : 'cerrado',
      reintentoEn: this.abiertoHasta > Date.now() ? new Date(this.abiertoHasta).toISOString() : null,
      llamadasUltMin: this.#recientes().length,
      fallosSeguidos: this.fallosSeguidos,
      cliVersion: this.cliVersion,
    };
  }

  smokeTest() {
    exec('claude --version', { timeout: 15000, windowsHide: true }, (err, stdout) => {
      if (err) {
        log.warn(`clasificador: CLI de claude no disponible (${err.message.split('\n')[0]}) — solo capa 1`);
      } else {
        this.cliVersion = stdout.trim();
        log.info(`clasificador: claude CLI detectado (${this.cliVersion})`);
      }
    });
  }

  #recientes() {
    const corte = Date.now() - 60_000;
    this.llamadas = this.llamadas.filter((t) => t > corte);
    return this.llamadas;
  }

  puedeLlamar(s, l1) {
    const c = this.config.get().capa2 || {};
    if (!c.activada) return { ok: false, motivo: 'capa 2 desactivada' };
    if (l1.confianza >= (c.umbralConfianzaL1 ?? 0.75)) return { ok: false, motivo: 'confianza L1 suficiente' };
    if (s.cuota5h != null && s.cuota5h >= (c.cortarSiUso5h ?? 70)) return { ok: false, motivo: 'cuota 5h alta: no gastar en clasificar' };
    if (Date.now() < this.abiertoHasta) return { ok: false, motivo: 'circuit breaker abierto' };
    if (this.#recientes().length >= (c.maxLlamadasPorMinuto ?? 4)) return { ok: false, motivo: 'límite de llamadas/min' };
    return { ok: true };
  }

  async clasificar(s, l1) {
    const c = this.config.get().capa2 || {};
    const clave = crypto.createHash('sha256')
      .update(s.texto.toLowerCase().trim().replace(/\s+/g, ' ') + '|' + l1.tipoId)
      .digest('hex');
    const ttl = (c.cacheTtlMinutos ?? 60) * 60_000;
    const cacheada = this.cache.get(clave);
    if (cacheada && Date.now() - cacheada.ts < ttl) return { ...cacheada.rec, deCache: true };

    this.llamadas.push(Date.now());
    const t0 = Date.now();
    try {
      const salida = await this.#ejecutar(construirPrompt(s, l1), c);
      const rec = this.#parsear(salida);
      rec.latenciaMs = Date.now() - t0;
      this.fallosSeguidos = 0;
      this.cache.set(clave, { rec, ts: Date.now() });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
      return rec;
    } catch (e) {
      this.fallosSeguidos++;
      log.warn(`clasificador: fallo ${this.fallosSeguidos} (${String(e.message || e).slice(0, 200)})`);
      if (this.fallosSeguidos >= 3) {
        this.abiertoHasta = Date.now() + 10 * 60_000;
        this.emit('breaker', { estado: 'abierto', motivo: '3 fallos consecutivos', reintentoEn: new Date(this.abiertoHasta).toISOString() });
        log.warn('clasificador: circuit breaker ABIERTO 10 min — se sigue solo con capa 1');
      }
      return null;
    }
  }

  #ejecutar(prompt, c) {
    return new Promise((resolve, reject) => {
      const modelo = RE_MODELO_SEGURO.test(c.modelo || '') ? c.modelo : 'claude-haiku-4-5-20251001';
      // shell:true por resolución de claude.cmd/.exe en Windows; los args son
      // constantes y el contenido del usuario viaja SOLO por stdin.
      const child = spawn('claude', ['-p', '--model', modelo, '--output-format', 'json', '--max-turns', '1'], {
        cwd: CLASSIFIER_CWD,
        shell: true,
        windowsHide: true,
      });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('timeout'));
      }, c.timeoutMs ?? 20000);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`claude salió con código ${code}: ${err.slice(0, 300)}`));
      });
      child.stdin.on('error', () => {});
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  #parsear(salida) {
    let wrapper;
    try {
      wrapper = JSON.parse(salida.trim());
    } catch {
      const i = salida.indexOf('{');
      if (i < 0) throw new Error('salida sin JSON');
      wrapper = JSON.parse(salida.slice(i));
    }
    let resultado = wrapper.result ?? wrapper;
    if (typeof resultado === 'string') {
      const m = resultado.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('result sin JSON');
      resultado = JSON.parse(m[0]);
    }
    const modelo = String(resultado.recommended_model || '').toLowerCase();
    if (!NIVELES_MODELO.includes(modelo)) throw new Error(`modelo inválido: ${modelo}`);
    let esfuerzo = String(resultado.recommended_effort || '').toLowerCase();
    if (!NIVELES_ESFUERZO.includes(esfuerzo)) esfuerzo = 'medium';
    if (modelo === 'haiku') esfuerzo = null;
    let confianza = Number(resultado.confidence);
    if (!Number.isFinite(confianza)) throw new Error('confidence inválida');
    confianza = Math.max(0, Math.min(1, confianza));
    return {
      modelo,
      esfuerzo,
      confianza,
      tipoTarea: String(resultado.task_type || '').slice(0, 60) || null,
      complejidad: String(resultado.complexity || '').slice(0, 20) || null,
      reasoning: String(resultado.reasoning || '').slice(0, 200) || null,
    };
  }
}
