import { idxModelo } from '../engine/modelos.js';

/**
 * Etiquetado implícito: cada turno terminado se convierte en una etiqueta de
 * entrenamiento sin pedirle nada al usuario. Señales:
 *  - modelo realmente usado vs recomendado (¿siguió el consejo? ¿cambió con /model?)
 *  - fracaso del turno: racha de errores de herramienta o reenvío del mismo prompt
 */

const UMBRAL_ERRORES_FRACASO = 3;
const UMBRAL_SOLAPE_REINTENTO = 0.8;

function normalizar(texto) {
  return String(texto || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** ¿El prompt nuevo es un reenvío/reformulación del anterior? */
export function esReintento(anterior, nuevo) {
  const a = normalizar(anterior);
  const b = normalizar(nuevo);
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = new Set(a.split(' '));
  const pb = new Set(b.split(' '));
  if (pa.size < 4 || pb.size < 4) return false; // demasiado cortos para comparar
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  const solape = comunes / Math.max(pa.size, pb.size);
  return solape >= UMBRAL_SOLAPE_REINTENTO;
}

/**
 * Veredicto del turno:
 *  - acierto        siguió el consejo y el turno fue bien
 *  - corto          siguió el consejo y el turno fracasó (quizá recomendamos de menos)
 *  - usuario_subio  usó un modelo mayor y fue bien (quizá recomendamos de menos)
 *  - usuario_bajo   usó un modelo menor y fue bien (quizá recomendamos de más)
 *  - bajo_y_fallo   usó un modelo menor y fracasó (la recomendación tenía razón)
 *  - indeterminado  usó un modelo mayor y aun así fracasó (sin señal limpia)
 *  - null           no sabemos qué modelo se usó
 */
export function veredicto({ recModelo, modeloUsado, fracaso }) {
  if (!recModelo || !modeloUsado) return null;
  const delta = idxModelo(modeloUsado) - idxModelo(recModelo);
  if (delta === 0) return fracaso ? 'corto' : 'acierto';
  if (delta < 0) return fracaso ? 'bajo_y_fallo' : 'usuario_bajo';
  return fracaso ? 'indeterminado' : 'usuario_subio';
}

/** La recomendación se considera correcta con estos veredictos. */
export const VEREDICTOS_ACIERTO = new Set(['acierto', 'bajo_y_fallo']);
/** Y evaluable (con señal limpia) con estos. */
export const VEREDICTOS_EVALUABLES = new Set(['acierto', 'corto', 'usuario_subio', 'usuario_bajo', 'bajo_y_fallo']);

/**
 * turno cerrado (de SessionState.cerrarTurno) + prompt nuevo → etiqueta JSONL.
 * No guarda el prompt completo: solo lo necesario para aprender y auditar.
 */
export function construirEtiqueta(cerrado, nuevoTexto, sessionId) {
  const r = cerrado.rec;
  const reintento = esReintento(cerrado.promptAnterior, nuevoTexto);
  const fracaso = cerrado.erroresTurno >= UMBRAL_ERRORES_FRACASO || reintento;
  return {
    ts: new Date().toISOString(),
    sessionId,
    recId: r.id,
    tipoId: r.l1?.tipoId ?? null,
    fuente: r.fuente || 'heuristica',
    confianza: r.confianza ?? null,
    recModelo: r.modelo,
    recEsfuerzo: r.esfuerzo ?? null,
    modeloUsado: cerrado.modeloUsado ?? null,
    siguioConsejo: cerrado.modeloUsado ? cerrado.modeloUsado === r.modelo : null,
    erroresTurno: cerrado.erroresTurno,
    reintento,
    fracaso,
    veredicto: veredicto({ recModelo: r.modelo, modeloUsado: cerrado.modeloUsado, fracaso }),
    prompt: String(cerrado.promptAnterior || '').slice(0, 160),
  };
}
