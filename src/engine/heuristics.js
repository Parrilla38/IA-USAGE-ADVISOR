import { puntuar, RE_ACK, RE_CONTINUACION, RE_ORDEN_REFERENCIAL } from './lexicon.es.js';
import { moverModelo, moverEsfuerzo, maxModelo, maxEsfuerzo, idxModelo } from './modelos.js';

/** Rúbrica base: tipo de tarea → grupo, modelo, esfuerzo, confianza. */
export const BASE = {
  pregunta_rapida: { grupo: 'trivial', modelo: 'haiku', esfuerzo: null, conf: 0.85, nombre: 'Pregunta rápida' },
  formateo:        { grupo: 'trivial', modelo: 'haiku', esfuerzo: null, conf: 0.85, nombre: 'Formateo / tarea mecánica' },
  comandos:        { grupo: 'trivial', modelo: 'haiku', esfuerzo: null, conf: 0.8, nombre: 'Comando / operación' },
  edicion_puntual: { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'low', conf: 0.8, nombre: 'Edición puntual' },
  codificacion:    { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'medium', conf: 0.75, nombre: 'Codificación cotidiana' },
  integracion:     { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'high', conf: 0.7, nombre: 'Codificación con integración' },
  debugging:       { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'high', conf: 0.7, nombre: 'Debugging' },
  rendimiento:     { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'high', conf: 0.7, nombre: 'Optimización de rendimiento' },
  analisis_datos:  { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'medium', conf: 0.7, nombre: 'Análisis de datos / script' },
  documentacion:   { grupo: 'estandar', modelo: 'haiku', esfuerzo: null, conf: 0.7, nombre: 'Documentación / redacción' },
  revision:        { grupo: 'complejo', modelo: 'sonnet', esfuerzo: 'high', conf: 0.7, nombre: 'Revisión de código' },
  seguridad:       { grupo: 'complejo', modelo: 'opus', esfuerzo: 'xhigh', conf: 0.75, nombre: 'Seguridad / vulnerabilidades' },
  debugging_duro:  { grupo: 'complejo', modelo: 'opus', esfuerzo: 'xhigh', conf: 0.75, nombre: 'Debugging duro' },
  refactor:        { grupo: 'complejo', modelo: 'opus', esfuerzo: 'xhigh', conf: 0.75, nombre: 'Refactor multi-fichero' },
  refactor_masivo: { grupo: 'frontera', modelo: 'fable', esfuerzo: 'xhigh', conf: 0.7, nombre: 'Refactor masivo' },
  arquitectura:    { grupo: 'frontera', modelo: 'fable', esfuerzo: 'xhigh', conf: 0.8, nombre: 'Arquitectura / planificación' },
  ambigua:         { grupo: 'frontera', modelo: 'fable', esfuerzo: 'xhigh', conf: 0.6, nombre: 'Objetivo abierto / ambiguo' },
};

const GRUPOS = { trivial: 0, estandar: 1, complejo: 2, frontera: 3 };
const NOMBRES_COMPLEJIDAD = ['trivial', 'estándar', 'complejo', 'frontera'];

// Matriz de escalado: [complejidad detectada][grupo base] → [modelo, esfuerzo].
// Solo se usa para SUBIR (nunca deja la recomendación por debajo de la base).
const MATRIZ = [
  [['haiku', null], ['sonnet', 'low'], ['sonnet', 'high'], ['opus', 'high']],
  [['haiku', null], ['sonnet', 'medium'], ['opus', 'high'], ['fable', 'xhigh']],
  [['sonnet', 'low'], ['sonnet', 'high'], ['opus', 'xhigh'], ['fable', 'xhigh']],
  [['sonnet', 'medium'], ['opus', 'high'], ['fable', 'xhigh'], ['fable', 'xhigh']],
];

const RE_OBJETO_CONCRETO = /\b(esta|este|el|la) (consulta|funci[oó]n|clase|componente|query|m[eé]todo|p[aá]gina|endpoint|test|fichero|archivo)\b/i;
const RE_DOC_TECNICA = /\b(api|endpoint|t[eé]cnic|detallad|exhaustiv|arquitectura)\w*/i;

function redondear(x) { return Math.round(x * 100) / 100; }

/**
 * Ganador de la puntuación léxica. Empate a puntos → gana el grupo de mayor
 * capacidad (quedarse corto cuesta más que pasarse). El margen se mide contra
 * el mejor tipo que llevaría a OTRO modelo (rivales con el mismo modelo no
 * cambian la decisión y no penalizan confianza).
 */
function elegirTipo(punt) {
  if (!punt.size) return null;
  let mejor = null;
  for (const [tipo, pts] of punt) {
    if (!mejor || pts > mejor.pts + 1e-9 ||
        (Math.abs(pts - mejor.pts) < 1e-9 && GRUPOS[BASE[tipo].grupo] > GRUPOS[BASE[mejor.tipo].grupo])) {
      mejor = { tipo, pts };
    }
  }
  let rival = null;
  let rivalPts = 0;
  for (const [tipo, pts] of punt) {
    if (tipo === mejor.tipo || BASE[tipo].modelo === BASE[mejor.tipo].modelo) continue;
    if (pts > rivalPts) { rival = tipo; rivalPts = pts; }
  }
  return { tipo: mejor.tipo, puntos: mejor.pts, rival, margen: mejor.pts - rivalPts };
}

/**
 * CAPA 1: recomendación síncrona por rúbrica puntuada + modificadores.
 * señales → { modelo, esfuerzo, confianza, tipoTarea, tipoId, complejidad, razones[] }
 */
export function recomendar(s, cfg) {
  const u = cfg.umbrales || {};
  const razones = [];
  let confOverride = null;
  let esContinuacion = false;

  // --- Detección de tipo por puntuación léxica ---
  const punt = puntuar(s.texto);
  let det = elegirTipo(punt);
  let tipo = det?.tipo ?? null;

  // Prompt referencial ("sí, hazlo", "implementa", "continúa"): el QUÉ no está
  // en el prompt sino en el contexto. Solo si el léxico no encontró nada fuerte.
  const esAck = RE_ACK.test(s.texto);
  const esOrden = RE_ORDEN_REFERENCIAL.test(s.texto) && s.palabras <= 8;
  const esCont = RE_CONTINUACION.test(s.texto) && s.palabras <= 8;
  if ((det?.puntos ?? 0) < 2 && (esAck || esOrden || esCont)) {
    // La propuesta en curso vive en la última respuesta del asistente: puntuarla.
    const detAsist = s.textoAsistente ? elegirTipo(puntuar(s.textoAsistente)) : null;
    const asistFuerte = detAsist && detAsist.puntos >= 2 && BASE[detAsist.tipo] ? detAsist : null;
    const previo = s.tipoPrevio && BASE[s.tipoPrevio] ? s.tipoPrevio : null;
    // ACK/orden confirman lo que el asistente propuso; "continúa" retoma lo
    // que ya se estaba haciendo (tipo previo) y usa la propuesta como respaldo.
    const usarAsistente = asistFuerte && ((esAck || esOrden) || !previo);
    if (usarAsistente) {
      tipo = asistFuerte.tipo;
      det = null;
      esContinuacion = true;
      confOverride = Math.min(0.72, Math.max(0.55, BASE[tipo].conf - 0.1));
      razones.push(`confirma la propuesta previa del asistente (${BASE[tipo].nombre.toLowerCase()})`);
    } else if (previo) {
      tipo = previo;
      det = null;
      esContinuacion = true;
      confOverride = Math.min(0.75, Math.max(0.5, (s.confPrevia ?? BASE[tipo].conf) - 0.1));
      razones.push('continuación del turno anterior: hereda el tipo de tarea');
    }
  }

  if (tipo === 'ambigua' && (s.palabras >= 25 || s.ficheros > 0 || s.densidadCodigo >= 0.3 || RE_OBJETO_CONCRETO.test(s.texto))) {
    tipo = 'codificacion';
    det = null;
    confOverride = 0.6;
    razones.push('objetivo de mejora con contexto concreto');
  }
  if (!tipo) {
    if (s.densidadCodigo >= 0.3 || s.ficheros > 0) {
      tipo = 'codificacion'; confOverride = 0.55;
      razones.push('sin patrón léxico claro; hay código o ficheros');
    } else if (s.palabras < 8 && s.turnos <= 1) {
      tipo = 'pregunta_rapida'; confOverride = 0.55;
      razones.push('prompt muy corto y sin contexto: clasificación incierta');
    } else if (s.palabras < 15) {
      tipo = 'pregunta_rapida'; confOverride = 0.55;
    } else {
      tipo = 'ambigua'; confOverride = 0.5;
      razones.push('objetivo no reconocido');
    }
  }

  const base = BASE[tipo];
  razones.unshift(`tarea detectada: ${base.nombre}`);
  const idxGrupo = GRUPOS[base.grupo];
  let conf = confOverride ?? base.conf;

  // --- Confianza según la puntuación léxica ---
  if (det) {
    if (det.puntos >= 4) {
      conf += 0.05;
      razones.push(`varias señales léxicas independientes coinciden (${det.puntos} pts)`);
    } else if (det.puntos < 2) {
      conf -= 0.05;
    }
    if (det.rival && det.margen <= 0.5) {
      conf -= 0.07;
      razones.push(`señales mixtas: también podría ser ${BASE[det.rival].nombre.toLowerCase()}`);
    }
  }

  // --- Complejidad estructural (ajusta el grupo base) ---
  let ajuste = 0;
  if (s.mencionRepoEntero) { ajuste += 2; razones.push('menciona el proyecto entero'); }
  if (s.ficheros > 20) { ajuste += 2; razones.push(`${s.ficheros} ficheros implicados`); }
  else if (s.ficheros > 5) { ajuste += 1; razones.push(`${s.ficheros} ficheros implicados`); }
  if (s.palabras > 250) { ajuste += 1; razones.push('prompt muy extenso'); }
  // La brevedad solo abarata tareas cuyo alcance crece con el prompt (estándar,
  // revisión). En seguridad o debugging duro un prompt corto no es tarea pequeña.
  if (!esContinuacion && s.palabras < 15 && s.densidadCodigo < 0.2 && s.ficheros === 0 &&
      (idxGrupo === 1 || tipo === 'revision')) {
    ajuste -= 1;
    razones.push('petición breve y acotada');
  }
  const idxComplejidad = Math.max(0, Math.min(3, idxGrupo + ajuste));

  let modelo = base.modelo;
  let esfuerzo = base.esfuerzo;
  if (idxComplejidad > idxGrupo) {
    const [mM, mE] = MATRIZ[idxComplejidad][idxGrupo];
    modelo = maxModelo(modelo, mM);
    esfuerzo = maxEsfuerzo(esfuerzo, mE);
    conf -= 0.05;
  } else if (idxComplejidad < idxGrupo) {
    esfuerzo = moverEsfuerzo(esfuerzo, -1);
  }

  // --- Ajustes específicos de tipo ---
  if (tipo === 'documentacion' && (s.palabras > 100 || RE_DOC_TECNICA.test(s.texto))) {
    modelo = maxModelo(modelo, 'sonnet');
    esfuerzo = esfuerzo || 'medium';
    razones.push('documentación técnica: mejor un modelo intermedio');
  }
  if (tipo === 'revision' && (s.ficheros > 5 || s.mencionRepoEntero || s.palabras > 150)) {
    modelo = maxModelo(modelo, 'opus');
    esfuerzo = 'xhigh';
    razones.push('revisión de alcance grande');
  }
  // Dos peticiones de arreglo seguidas: el problema resiste más de lo que parece
  if (tipo === 'debugging' && (s.tipoPrevio === 'debugging' || s.tipoPrevio === 'debugging_duro')) {
    modelo = moverModelo(modelo, +1);
    esfuerzo = maxEsfuerzo(esfuerzo, 'high');
    razones.push('segundo intento de arreglo consecutivo: subir capacidad');
  }

  // --- Modificadores (en orden) ---
  // 1. Racha de errores de herramientas: la tarea es más dura de lo que parece
  if (s.rachaErrores >= 3) {
    modelo = moverModelo(modelo, +1);
    esfuerzo = maxEsfuerzo(esfuerzo ?? 'high', 'high');
    razones.push(`${s.rachaErrores} fallos de herramienta seguidos: subir capacidad`);
  }
  // 2. Cuota de la suscripción
  const criticas = (s.cuota5h != null && s.cuota5h >= (u.cuotaCritica ?? 95)) ||
    (s.cuotaSemana != null && s.cuotaSemana >= (u.cuotaCritica ?? 95));
  const altas = (s.cuota5h != null && s.cuota5h >= (u.cuota5hAlta ?? 80)) ||
    (s.cuotaSemana != null && s.cuotaSemana >= (u.cuotaSemanaAlta ?? 85));
  if (criticas) {
    modelo = moverModelo(modelo, -2);
    razones.push(`cuota casi agotada (5h ${s.cuota5h ?? '?'}%, semana ${s.cuotaSemana ?? '?'}%): bajo dos niveles`);
  } else if (altas) {
    if (base.grupo !== 'frontera') {
      modelo = moverModelo(modelo, -1);
      razones.push('cuota alta: modelo más económico');
    } else {
      razones.push('cuota alta, pero la tarea justifica el modelo');
    }
  }
  // 3. Preferencia de latencia
  if (s.preferenciaLatencia === 'rapido' && base.grupo !== 'frontera' && idxModelo(modelo) > idxModelo('sonnet')) {
    modelo = 'sonnet';
    razones.push('preferencia de velocidad: tope en Sonnet');
  }
  // 4. Subagentes activos: no bajar de modelo a mitad de una orquestación
  if (s.subagentes && s.modeloActual && idxModelo(modelo) < idxModelo(s.modeloActual)) {
    modelo = s.modeloActual;
    razones.push('subagentes activos: mantener el modelo de la orquestación');
  }
  // 5. Haiku 4.5 no soporta el parámetro de esfuerzo
  if (modelo === 'haiku') esfuerzo = null;

  return {
    modelo,
    esfuerzo,
    confianza: redondear(Math.max(0.3, Math.min(1, conf))),
    tipoTarea: base.nombre,
    tipoId: tipo,
    complejidad: NOMBRES_COMPLEJIDAD[idxComplejidad],
    razones,
  };
}
