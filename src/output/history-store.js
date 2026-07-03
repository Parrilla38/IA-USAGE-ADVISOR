import fs from 'node:fs/promises';
import path from 'node:path';
import { HISTORY_DIR } from '../paths.js';
import { VEREDICTOS_ACIERTO, VEREDICTOS_EVALUABLES } from '../signals/outcome.js';

function mesDe(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function ficheroDelMes(prefijo, offsetMeses = 0) {
  const f = new Date();
  f.setMonth(f.getMonth() + offsetMeses);
  return path.join(HISTORY_DIR, `${prefijo}-${mesDe(f)}.jsonl`);
}

async function anotar(prefijo, obj) {
  try { await fs.appendFile(ficheroDelMes(prefijo), JSON.stringify(obj) + '\n'); } catch { /* mejor esfuerzo */ }
}

async function leerJsonl(ruta) {
  try {
    const contenido = await fs.readFile(ruta, 'utf8');
    const out = [];
    for (const linea of contenido.split('\n')) {
      const l = linea.trim();
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* línea corrupta */ }
    }
    return out;
  } catch {
    return [];
  }
}

export const anotarRecomendacion = (r) => anotar('recomendaciones', r);
export const anotarFeedback = (f) => anotar('feedback', f);
export const anotarEtiqueta = (e) => anotar('etiquetas', e);

async function leerUltimosMeses(prefijo) {
  return [...await leerJsonl(ficheroDelMes(prefijo, -1)), ...await leerJsonl(ficheroDelMes(prefijo))];
}

export async function leerRecomendaciones({ dias = 7, limite = 300 } = {}) {
  const corte = Date.now() - dias * 24 * 3600 * 1000;
  const todas = (await leerUltimosMeses('recomendaciones')).filter((r) => Date.parse(r.ts || '') >= corte);
  // quedarnos con la última revisión de cada recomendación
  const porId = new Map();
  for (const r of todas) {
    const previa = porId.get(r.id);
    if (!previa || (r.rev || 1) >= (previa.rev || 1)) porId.set(r.id, r);
  }
  return [...porId.values()].slice(-limite);
}

/** Agregado de etiquetas implícitas: tasa de acierto real y dónde se falla. */
export async function resumenEtiquetas() {
  const todas = await leerUltimosMeses('etiquetas');
  const evaluables = todas.filter((e) => VEREDICTOS_EVALUABLES.has(e.veredicto));
  const aciertos = evaluables.filter((e) => VEREDICTOS_ACIERTO.has(e.veredicto)).length;
  const porVeredicto = {};
  const porTipo = {};
  for (const e of evaluables) {
    porVeredicto[e.veredicto] = (porVeredicto[e.veredicto] || 0) + 1;
    const t = e.tipoId || 'desconocido';
    porTipo[t] = porTipo[t] || { total: 0, aciertos: 0 };
    porTipo[t].total++;
    if (VEREDICTOS_ACIERTO.has(e.veredicto)) porTipo[t].aciertos++;
  }
  return {
    total: todas.length,
    evaluables: evaluables.length,
    aciertos,
    tasa: evaluables.length ? Math.round((aciertos / evaluables.length) * 100) : null,
    porVeredicto,
    porTipo,
  };
}

export async function calcularMetricas() {
  const recs = await leerRecomendaciones({ dias: 30, limite: 10000 });
  const fbs = await leerUltimosMeses('feedback');
  const utiles = fbs.filter((f) => f.util === true).length;
  const conL2 = recs.filter((r) => r.l2);
  const l1l2Coinciden = conL2.filter((r) => r.l1 && r.l2 && r.l1.modelo === r.l2.modelo).length;
  const distribucion = {};
  const distribucionUsado = {};
  let divergencias = 0;
  for (const r of recs) {
    if (r.modelo) distribucion[r.modelo] = (distribucion[r.modelo] || 0) + 1;
    if (r.actual?.modelo) distribucionUsado[r.actual.modelo] = (distribucionUsado[r.actual.modelo] || 0) + 1;
    if (r.coincide === false) divergencias++;
  }
  return {
    totalRecomendaciones: recs.length,
    feedback: { total: fbs.length, utiles, acierto: fbs.length ? Math.round((utiles / fbs.length) * 100) : null },
    coincidenciaL1L2: conL2.length ? Math.round((l1l2Coinciden / conL2.length) * 100) : null,
    llamadasCapa2: conL2.length,
    divergencias,
    distribucion,
    distribucionUsado,
    etiquetas: await resumenEtiquetas(),
  };
}
