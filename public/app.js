/* Cliente del dashboard: WebSocket en vivo + API REST. Sin dependencias. */
const NOMBRES = { haiku: 'Haiku 4.5', sonnet: 'Sonnet 5', opus: 'Opus 4.8', fable: 'Fable 5' };
const estado = {
  sesiones: new Map(),
  recs: [],
  config: null,
  clasificador: null,
  feedback: new Map(), // recId → util
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- WebSocket ----------------
function conectar() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => setChip('#chip-ws', '● en vivo', 'ok');
  ws.onclose = () => {
    setChip('#chip-ws', '● desconectado', 'mal');
    setTimeout(conectar, 2000);
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const p = msg.payload;
    switch (msg.type) {
      case 'snapshot':
        estado.sesiones = new Map((p.sessions || []).map((s) => [s.sessionId, s]));
        estado.config = p.config;
        estado.clasificador = p.classifier;
        renderTodo();
        cargarHistorial();
        cargarMetricas();
        cargarIntegraciones();
        break;
      case 'session_update':
        estado.sesiones.set(p.sessionId, p);
        renderSesiones();
        break;
      case 'session_closed':
        estado.sesiones.delete(p.sessionId);
        renderSesiones();
        break;
      case 'recommendation': {
        const i = estado.recs.findIndex((r) => r.id === p.id);
        if (i >= 0) estado.recs[i] = p; else estado.recs.unshift(p);
        estado.recs = estado.recs.slice(0, 40);
        const ses = estado.sesiones.get(p.sessionId);
        if (ses) { ses.ultimaRec = p; }
        renderSesiones();
        renderFeed();
        break;
      }
      case 'config':
        estado.config = p;
        renderConfig();
        break;
      case 'classifier_status':
        estado.clasificador = { ...estado.clasificador, ...p };
        renderChips();
        break;
      case 'feedback_ack':
        estado.feedback.set(p.recId, p.util);
        renderFeed();
        break;
      default: break;
    }
  };
}

function setChip(sel, texto, clase) {
  const el = $(sel);
  el.textContent = texto;
  el.className = 'chip' + (clase ? ' ' + clase : '');
}

// ---------------- Render ----------------
function renderChips() {
  setChip('#chip-sesiones', `${estado.sesiones.size} sesión${estado.sesiones.size === 1 ? '' : 'es'}`);
  const c = estado.clasificador || {};
  const abierto = c.estado === 'abierto';
  setChip('#chip-clasificador', `clasificador: ${abierto ? 'pausado' : (c.cliVersion ? 'listo' : 'sin CLI')}`, abierto ? 'mal' : 'ok');
}

function badge(modelo) {
  if (!modelo) return '<span class="badge desconocido">—</span>';
  return `<span class="badge ${esc(modelo)}">${esc(NOMBRES[modelo] || modelo)}</span>`;
}

function barra(pct, alertaDesde) {
  if (pct == null) return '';
  const alerta = pct >= alertaDesde ? ' alerta' : '';
  return `<div class="barra${alerta}" title="${pct}%"><div style="width:${Math.min(100, pct)}%"></div></div>`;
}

function renderSesiones() {
  renderChips();
  const cont = $('#sesiones');
  if (!estado.sesiones.size) {
    cont.innerHTML = '<div class="vacio">Sin sesiones de Claude Code activas. Abre una y aparecerá aquí.</div>';
    return;
  }
  cont.innerHTML = [...estado.sesiones.values()].map((s) => {
    const r = s.ultimaRec;
    const tk = s.tokens ? `${((s.tokens.entrada + s.tokens.salida) / 1000).toFixed(1)}k tokens` : '';
    return `<div class="sesion">
      <div class="cab"><span class="nombre">${esc(s.nombre)}</span><span class="ruta">${esc(s.cwd || '')}</span></div>
      <div class="datos">
        <span>${s.turnos ?? 0} turnos</span><span>${tk}</span>
        ${s.ctxPct != null ? `<span>ctx ${Math.round(s.ctxPct)}%</span>${barra(s.ctxPct, 75)}` : ''}
        ${s.cuota5h != null ? `<span>cuota 5h ${Math.round(s.cuota5h)}%</span>${barra(s.cuota5h, 80)}` : ''}
        ${s.transcript ? '' : '<span title="buscando transcript">⏳ transcript…</span>'}
      </div>
      <div class="modelos-linea">
        <span>En uso:</span>${badge(s.modeloActual)}
        ${r ? `<span>→ Recomendado:</span>${badge(r.modelo)}${r.esfuerzo ? `<span class="chip">${esc(r.esfuerzo)}</span>` : ''}
          ${r.coincide === false ? '<span class="difiere">⚠ difiere</span>' : (r.coincide === true ? '<span class="coincide">✓ coincide</span>' : '')}` : '<span class="ruta">esperando primer prompt…</span>'}
      </div>
    </div>`;
  }).join('');
}

function renderFeed() {
  const cont = $('#feed');
  if (!estado.recs.length) {
    cont.innerHTML = '<div class="vacio">Aún no hay recomendaciones. Escribe un prompt en Claude Code.</div>';
    return;
  }
  cont.innerHTML = estado.recs.map((r) => {
    const fb = estado.feedback.get(r.id);
    const nombreSes = estado.sesiones.get(r.sessionId)?.nombre || (r.sessionId || '').slice(0, 8);
    return `<div class="rec">
      <div class="cab">
        ${badge(r.modelo)}${r.esfuerzo ? `<span class="chip">${esc(r.esfuerzo)}</span>` : ''}
        <span class="fuente">${esc(r.fuente)}</span>
        <span class="hora">${new Date(r.ts).toLocaleTimeString('es-ES')} · ${esc(nombreSes)}</span>
        <span class="conf">conf. ${Math.round((r.confianza || 0) * 100)}%</span>
      </div>
      <div class="tarea">${esc(r.tipoTarea)} · complejidad ${esc(r.complejidad)}
        ${r.coincide === false ? ` — en uso: ${esc(NOMBRES[r.actual?.modelo] || r.actual?.modelo || '?')} <span class="difiere">⚠</span>` : ''}
      </div>
      <ul class="razones">${(r.razones || []).map((z) => `<li>${esc(z)}</li>`).join('')}</ul>
      ${(r.consejos || []).map((c) => `<div class="consejo">💡 ${esc(c.texto)}</div>`).join('')}
      <div class="acciones">
        <button data-fb="1" data-rec="${esc(r.id)}" class="${fb === true ? 'marcado' : ''}">👍 útil</button>
        <button data-fb="0" data-rec="${esc(r.id)}" class="${fb === false ? 'marcado' : ''}">👎 no</button>
      </div>
    </div>`;
  }).join('');
  cont.querySelectorAll('button[data-fb]').forEach((b) => {
    b.onclick = () => enviarFeedback(b.dataset.rec, b.dataset.fb === '1');
  });
}

function renderConfig() {
  const c = estado.config;
  if (!c) return;
  $('#cfg-capa2').checked = Boolean(c.capa2?.activada);
  $('#cfg-toasts').checked = Boolean(c.toasts?.activados);
  $('#cfg-puerta').checked = Boolean(c.hookBloqueo?.activado);
  $('#cfg-latencia').value = c.preferenciaLatencia || 'equilibrado';
  $('#cfg-umbral').value = c.capa2?.umbralConfianzaL1 ?? 0.75;
  $('#cfg-maxllamadas').value = c.capa2?.maxLlamadasPorMinuto ?? 4;
}

function renderTodo() {
  renderSesiones();
  renderFeed();
  renderConfig();
  renderChips();
}

// ---------------- API ----------------
async function api(ruta, opciones) {
  const res = await fetch(ruta, opciones);
  if (!res.ok) throw new Error(`${ruta}: ${res.status}`);
  return res.json();
}

async function cargarHistorial() {
  try {
    const hist = await api('/api/historial?dias=3');
    const vivos = new Map(estado.recs.map((r) => [r.id, r]));
    for (const r of hist.reverse()) if (!vivos.has(r.id)) estado.recs.push(r);
    estado.recs.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    estado.recs = estado.recs.slice(0, 40);
    renderFeed();
  } catch { /* sin historial */ }
}

async function cargarMetricas() {
  try {
    const m = await api('/api/metricas');
    const dist = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const total = Object.values(obj).reduce((x, y) => x + y, 0) || 1;
      return `<div class="df"><span>${esc(NOMBRES[k] || k)}</span><div class="barra"><div style="width:${(v / total) * 100}%"></div></div><span>${v}</span></div>`;
    }).join('') || '<span class="nota">sin datos</span>';
    $('#metricas').innerHTML = `
      <div class="stat"><div class="valor">${m.totalRecomendaciones}</div><div class="etiqueta">recomendaciones</div></div>
      <div class="stat"><div class="valor">${m.feedback.acierto != null ? m.feedback.acierto + '%' : '—'}</div><div class="etiqueta">acierto (feedback: ${m.feedback.total})</div></div>
      <div class="stat"><div class="valor">${m.coincidenciaL1L2 != null ? m.coincidenciaL1L2 + '%' : '—'}</div><div class="etiqueta">coincidencia L1↔L2 (${m.llamadasCapa2})</div></div>
      <div class="stat"><div class="valor">${m.divergencias}</div><div class="etiqueta">divergencias con el modelo usado</div></div>
      <div class="dist"><strong>Recomendado</strong>${dist(m.distribucion)}</div>
      <div class="dist"><strong>Usado realmente</strong>${dist(m.distribucionUsado)}</div>`;
  } catch { /* métricas no disponibles */ }
}

async function enviarFeedback(recId, util) {
  try {
    await api('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recId, util }),
    });
    estado.feedback.set(recId, util);
    renderFeed();
    cargarMetricas();
  } catch { /* sin daemon */ }
}

async function cargarIntegraciones() {
  try {
    const integ = await api('/api/integraciones');
    document.querySelectorAll('.integ').forEach((div) => {
      const cual = div.dataset.integ;
      const btn = div.querySelector('button');
      const instalada = Boolean(integ[cual]);
      btn.textContent = instalada ? 'Desinstalar' : 'Instalar';
      btn.className = instalada ? 'secundario' : '';
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const r = await api(`/api/integraciones/${cual}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accion: instalada ? 'desinstalar' : 'instalar' }),
          });
          alert(r.mensaje || 'Hecho');
        } catch (e) {
          alert('Error: ' + e.message);
        }
        btn.disabled = false;
        cargarIntegraciones();
      };
    });
  } catch { /* daemon apagado */ }
}

// ---------------- Config: guardar cambios ----------------
let timerCfg = null;
function guardarConfig(parcial) {
  clearTimeout(timerCfg);
  timerCfg = setTimeout(() => {
    api('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parcial),
    }).catch(() => {});
  }, 300);
}

$('#cfg-capa2').onchange = (e) => guardarConfig({ capa2: { activada: e.target.checked } });
$('#cfg-toasts').onchange = (e) => guardarConfig({ toasts: { activados: e.target.checked } });
$('#cfg-puerta').onchange = (e) => guardarConfig({ hookBloqueo: { activado: e.target.checked } });
$('#cfg-latencia').onchange = (e) => guardarConfig({ preferenciaLatencia: e.target.value });
$('#cfg-umbral').onchange = (e) => guardarConfig({ capa2: { umbralConfianzaL1: Number(e.target.value) } });
$('#cfg-maxllamadas').onchange = (e) => guardarConfig({ capa2: { maxLlamadasPorMinuto: Number(e.target.value) } });
$('#btn-toast').onclick = () => api('/api/toast-prueba', { method: 'POST' }).catch(() => {});
$('#btn-widget').onclick = () => api('/api/widget', { method: 'POST' }).catch(() => {});

// ---------------- Probar prompt antes de enviarlo ----------------
async function probarPrompt() {
  const texto = $('#probar-texto').value.trim();
  if (!texto) return;
  const cont = $('#probar-resultado');
  cont.innerHTML = '<span class="nota">analizando…</span>';
  try {
    const r = await api('/api/hook/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: texto }),
    });
    const rec = r.rec;
    cont.innerHTML = `
      <div class="modelos-linea">${badge(rec.modelo)}${rec.esfuerzo ? `<span class="chip">${esc(rec.esfuerzo)}</span>` : ''}
        <span class="conf">conf. ${Math.round(rec.confianza * 100)}%</span></div>
      <div class="tarea">${esc(rec.tipoTarea)} · complejidad ${esc(rec.complejidad)}</div>
      <ul class="razones">${(rec.razones || []).map((z) => `<li>${esc(z)}</li>`).join('')}</ul>
      ${(r.consejos || []).map((c) => `<div class="consejo">💡 ${esc(c.texto)}</div>`).join('')}
      <p class="nota">Si difiere del actual: <code>/model ${esc(rec.modelo)}</code> y después envía el prompt.</p>`;
  } catch {
    cont.innerHTML = '<span class="nota">El daemon no responde.</span>';
  }
}
$('#btn-probar').onclick = probarPrompt;
$('#probar-texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) probarPrompt();
});

conectar();
setInterval(cargarMetricas, 60_000);
