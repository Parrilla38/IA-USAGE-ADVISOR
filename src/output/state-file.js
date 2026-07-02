import fs from 'node:fs/promises';
import { STATE_FILE } from '../paths.js';

let timer = null;
let ultimaFn = null;

/** Escritura atómica y debounced de current.json (contrato con el statusline). */
export function programarStateFile(fn) {
  ultimaFn = fn;
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try { await escribir(ultimaFn()); } catch { /* mejor esfuerzo */ }
  }, 100);
}

async function escribir(datos) {
  const contenido = JSON.stringify(datos);
  const tmp = STATE_FILE + '.tmp';
  try {
    await fs.writeFile(tmp, contenido);
    await fs.rename(tmp, STATE_FILE); // atómico también en Windows (MoveFileEx)
  } catch {
    try { await fs.writeFile(STATE_FILE, contenido); } catch { /* mejor esfuerzo */ }
  }
}
