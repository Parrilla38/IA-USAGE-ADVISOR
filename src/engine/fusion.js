/**
 * Fusión de capas: L2 con confianza alta prevalece; media, se mezcla de forma
 * conservadora; baja, se descarta. Ambas capas quedan siempre en el resultado
 * para registro y evaluación posterior.
 */
export function fusionar(l1, l2) {
  if (!l2) {
    return { modelo: l1.modelo, esfuerzo: l1.esfuerzo, confianza: l1.confianza, tipoTarea: l1.tipoTarea, complejidad: l1.complejidad, razones: l1.razones, fuente: 'heuristica', l1, l2: null };
  }
  if (l2.confianza >= 0.7) {
    const esfuerzo = l2.modelo === 'haiku' ? null : l2.esfuerzo;
    return {
      modelo: l2.modelo,
      esfuerzo,
      confianza: l2.confianza,
      tipoTarea: l2.tipoTarea || l1.tipoTarea,
      complejidad: l2.complejidad || l1.complejidad,
      razones: [...l1.razones, ...(l2.reasoning ? [`IA: ${l2.reasoning}`] : [])],
      fuente: 'ia',
      l1,
      l2,
    };
  }
  if (l2.confianza >= 0.5) {
    const coincide = l2.modelo === l1.modelo;
    return {
      modelo: l1.modelo,
      esfuerzo: l1.esfuerzo,
      confianza: Math.min(1, Math.round(((l1.confianza + l2.confianza) / 2 + (coincide ? 0.1 : 0)) * 100) / 100),
      tipoTarea: l1.tipoTarea,
      complejidad: l1.complejidad,
      razones: [...l1.razones, ...(l2.reasoning ? [`IA (conf. media): ${l2.reasoning}`] : [])],
      fuente: 'fusion',
      l1,
      l2,
    };
  }
  return { modelo: l1.modelo, esfuerzo: l1.esfuerzo, confianza: l1.confianza, tipoTarea: l1.tipoTarea, complejidad: l1.complejidad, razones: l1.razones, fuente: 'heuristica', l1, l2 };
}
