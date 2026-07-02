import { detectarTipo } from './lexicon.es.js';
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
  analisis_datos:  { grupo: 'estandar', modelo: 'sonnet', esfuerzo: 'medium', conf: 0.7, nombre: 'Análisis de datos / script' },
  documentacion:   { grupo: 'estandar', modelo: 'haiku', esfuerzo: null, conf: 0.7, nombre: 'Documentación / redacción' },
  revision:        { grupo: 'complejo', modelo: 'sonnet', esfuerzo: 'high', conf: 0.7, nombre: 'Revisión de código' },
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
 * CAPA 1: recomendación síncrona por rúbrica + modificadores.
 * señales → { modelo, esfuerzo, confianza, tipoTarea, tipoId, complejidad, razones[] }
 */
export function recomendar(s, cfg) {
  const u = cfg.umbrales || {};
  const razones = [];
  let confOverride = null;

  // --- Detección de tipo (con guardas y fallbacks) ---
  let tipo = detectarTipo(s.texto);
  if (tipo === 'ambigua' && (s.palabras >= 25 || s.ficheros > 0 || s.densidadCodigo >= 0.3 || RE_OBJETO_CONCRETO.test(s.texto))) {
    tipo = 'codificacion';
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

  // --- Complejidad estructural (ajusta el grupo base) ---
  let ajuste = 0;
  if (s.mencionRepoEntero) { ajuste += 2; razones.push('menciona el proyecto entero'); }
  if (s.ficheros > 20) { ajuste += 2; razones.push(`${s.ficheros} ficheros implicados`); }
  else if (s.ficheros > 5) { ajuste += 1; razones.push(`${s.ficheros} ficheros implicados`); }
  if (s.palabras > 250) { ajuste += 1; razones.push('prompt muy extenso'); }
  if (s.palabras < 15 && s.densidadCodigo < 0.2 && s.ficheros === 0 && (idxGrupo === 1 || idxGrupo === 2)) {
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
