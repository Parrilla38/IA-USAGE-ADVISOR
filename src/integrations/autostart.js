import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const STARTUP_DIR = path.join(
  process.env.APPDATA || '',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
);
const VBS = path.join(STARTUP_DIR, 'ai-usage-advisor.vbs');

/** Arranque al iniciar sesión de Windows: .vbs en Startup que lanza node oculto. */
export async function instalarAutostart() {
  const linea = `CreateObject("Wscript.Shell").Run """${process.execPath}"" ""${INDEX}""", 0, False\r\n`;
  await fs.writeFile(VBS, linea);
  return { ok: true, mensaje: 'Autoarranque instalado (carpeta Inicio de Windows)' };
}

export async function desinstalarAutostart() {
  try { await fs.unlink(VBS); } catch { /* no estaba */ }
  return { ok: true, mensaje: 'Autoarranque desinstalado' };
}

export async function autostartInstalado() {
  try { await fs.access(VBS); return true; } catch { return false; }
}
