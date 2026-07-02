import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_DIR } from '../paths.js';

const cache = new Map(); // sessionId → ruta

/**
 * Localiza el transcript <sessionId>.jsonl bajo ~/.claude/projects/** sin
 * calcular el slug del cwd (frágil entre versiones): búsqueda directa.
 */
export async function localizarTranscript(sessionId) {
  const cacheada = cache.get(sessionId);
  if (cacheada) {
    try { await fs.access(cacheada); return cacheada; } catch { cache.delete(sessionId); }
  }
  let dirs;
  try { dirs = await fs.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch { return null; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const ruta = path.join(PROJECTS_DIR, d.name, `${sessionId}.jsonl`);
    try {
      await fs.access(ruta);
      cache.set(sessionId, ruta);
      return ruta;
    } catch { /* seguir buscando */ }
  }
  return null;
}

/** Reintenta: una sesión recién abierta tarda unos segundos en crear su .jsonl. */
export async function localizarConReintentos(sessionId, { intentos = 30, esperaMs = 2000, sigueViva = () => true } = {}) {
  for (let i = 0; i < intentos; i++) {
    const ruta = await localizarTranscript(sessionId);
    if (ruta) return ruta;
    if (!sigueViva()) return null;
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  return null;
}
