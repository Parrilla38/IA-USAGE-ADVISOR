/** Prompt del clasificador capa 2 (se envía por stdin a `claude -p`). */
export function construirPrompt(s, l1) {
  const texto = s.texto.replaceAll('«', '"').replaceAll('»', '"');
  return `Eres un clasificador. Decide qué modelo de Claude y qué esfuerzo conviene para el próximo turno
de un usuario de Claude Code, para máxima eficiencia calidad/coste/velocidad.

MODELOS (de menor a mayor capacidad y coste):
- haiku: tareas triviales, formateo, preguntas rápidas, comandos.
- sonnet: codificación cotidiana estándar, bugs normales, tests, docs técnicas.
- opus: trabajo complejo multi-fichero, debugging duro, revisiones grandes.
- fable: máxima capacidad — planificación profunda, arquitectura, refactors masivos, specs ambiguas.

ESFUERZO: low (mecánico) | medium | high | xhigh (razonamiento profundo). Si eliges haiku, esfuerzo = "low".

Reglas:
- Si la cuota restante es baja (uso_5h>=80 o uso_semana>=85), penaliza modelos caros salvo tareas frontera.
- Si hay racha de errores de herramientas, sube capacidad.
- En caso de duda entre dos modelos, elige el más barato y baja "confidence".

Responde SOLO con este JSON, sin texto adicional:
{"task_type":"<etiqueta corta en español>","complexity":"trivial|estandar|complejo|frontera","recommended_model":"haiku|sonnet|opus|fable","recommended_effort":"low|medium|high|xhigh","confidence":0.0,"reasoning":"<máx 25 palabras, en español>"}

SEÑALES DEL TURNO:
prompt (truncado): «${texto}»
palabras=${s.palabras} densidad_codigo=${s.densidadCodigo} ficheros=${s.ficheros} attachments=${s.attachments}
turnos_sesion=${s.turnos} tokens_acumulados=${s.tokensAcumulados} errores_herramienta_recientes=${s.rachaErrores} subagentes=${s.subagentes}
modelo_actual=${s.modeloActual ?? 'desconocido'} contexto_pct=${s.ctxPct ?? '?'} uso_5h=${s.cuota5h ?? '?'} uso_semana=${s.cuotaSemana ?? '?'}
hipotesis_heuristica=${l1.tipoId} (${l1.modelo}/${l1.esfuerzo ?? '-'}, conf=${l1.confianza})`;
}
