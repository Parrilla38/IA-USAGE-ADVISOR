import { puntuar } from './lexicon.es.js';

/** Prompt del clasificador capa 2 (se envía por stdin a `claude -p`). */
export function construirPrompt(s, l1) {
  const texto = s.texto.replaceAll('«', '"').replaceAll('»', '"');
  const lexico = [...puntuar(s.texto)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, p]) => `${t}:${p}`)
    .join(',') || 'sin señales';
  return `Eres un clasificador. Decide qué modelo de Claude y qué esfuerzo conviene para el próximo turno
de un usuario de Claude Code, para máxima eficiencia calidad/coste/velocidad.

MODELOS (de menor a mayor capacidad y coste):
- haiku: tareas triviales, formateo, preguntas rápidas, comandos, docs cortas.
- sonnet: codificación cotidiana estándar, bugs normales, tests, docs técnicas, rendimiento acotado.
- opus: trabajo complejo multi-fichero, debugging duro (fallos intermitentes, fugas), auditorías de seguridad, revisiones grandes.
- fable: máxima capacidad — planificación profunda, arquitectura, refactors masivos, specs ambiguas.

ESFUERZO: low (mecánico) | medium | high | xhigh (razonamiento profundo). Si eliges haiku, esfuerzo = "low".

Reglas:
- Si la cuota restante es baja (uso_5h>=80 o uso_semana>=85), penaliza modelos caros salvo tareas frontera.
- Si hay racha de errores de herramientas o es el segundo intento de arreglar lo mismo, sube capacidad.
- Un prompt corto NO implica tarea fácil: "hay un deadlock" es frontera aunque tenga 3 palabras.
- Si el prompt es una continuación ("sigue", "hazlo"), asume la tarea del contexto de sesión.
- En caso de duda entre dos modelos, elige el más barato y baja "confidence".

Ejemplos:
- "¿qué hace este comando?" → haiku, trivial.
- "añade paginación al listado" → sonnet/medium, estandar.
- "el deploy falla solo en producción" → opus/xhigh, complejo.
- "planifica la migración a multi-tenant" → fable/xhigh, frontera.

Responde SOLO con este JSON, sin texto adicional:
{"task_type":"<etiqueta corta en español>","complexity":"trivial|estandar|complejo|frontera","recommended_model":"haiku|sonnet|opus|fable","recommended_effort":"low|medium|high|xhigh","confidence":0.0,"reasoning":"<máx 25 palabras, en español>"}

SEÑALES DEL TURNO:
prompt (truncado): «${texto}»
palabras=${s.palabras} densidad_codigo=${s.densidadCodigo} ficheros=${s.ficheros} attachments=${s.attachments}
turnos_sesion=${s.turnos} tokens_acumulados=${s.tokensAcumulados} errores_herramienta_recientes=${s.rachaErrores} subagentes=${s.subagentes}
modelo_actual=${s.modeloActual ?? 'desconocido'} contexto_pct=${s.ctxPct ?? '?'} uso_5h=${s.cuota5h ?? '?'} uso_semana=${s.cuotaSemana ?? '?'}
tipo_turno_anterior=${s.tipoPrevio ?? 'ninguno'} puntuaciones_lexico=${lexico}
hipotesis_heuristica=${l1.tipoId} (${l1.modelo}/${l1.esfuerzo ?? '-'}, conf=${l1.confianza})`;
}
