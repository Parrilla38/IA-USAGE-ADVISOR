export const NIVELES_MODELO = ['haiku', 'sonnet', 'opus', 'fable'];
export const NIVELES_ESFUERZO = ['low', 'medium', 'high', 'xhigh'];

export const NOMBRES_MODELO = {
  haiku: 'Haiku 4.5',
  sonnet: 'Sonnet 5',
  opus: 'Opus 4.8',
  fable: 'Fable 5',
};

/** "claude-opus-4-8" → "opus"; null si no se reconoce. */
export function mapearModelo(id) {
  if (!id) return null;
  const s = String(id).toLowerCase();
  for (const m of NIVELES_MODELO) if (s.includes(m)) return m;
  return null;
}

export function idxModelo(m) { return NIVELES_MODELO.indexOf(m); }

export function moverModelo(m, delta) {
  const i = idxModelo(m);
  if (i < 0) return m;
  return NIVELES_MODELO[Math.max(0, Math.min(NIVELES_MODELO.length - 1, i + delta))];
}

export function maxModelo(a, b) {
  return idxModelo(a) >= idxModelo(b) ? a : b;
}

export function moverEsfuerzo(e, delta) {
  if (e == null) return null;
  const i = NIVELES_ESFUERZO.indexOf(e);
  if (i < 0) return e;
  return NIVELES_ESFUERZO[Math.max(0, Math.min(NIVELES_ESFUERZO.length - 1, i + delta))];
}

export function maxEsfuerzo(a, b) {
  const ia = a == null ? -1 : NIVELES_ESFUERZO.indexOf(a);
  const ib = b == null ? -1 : NIVELES_ESFUERZO.indexOf(b);
  return ia >= ib ? a : b;
}
