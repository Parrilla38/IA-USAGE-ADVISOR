import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SETTINGS_FILE, BACKUPS_DIR, STATUSLINE_WRAPPER_DEST, INTEGRACIONES_FILE, asegurarDirectoriosDatos,
} from '../paths.js';
import { instalarAutostart, desinstalarAutostart, autostartInstalado } from './autostart.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANTILLA_WRAPPER = path.join(DIR, 'statusline-wrapper.ps1');
const RUTA_HOOK = path.join(DIR, 'hook-userpromptsubmit.mjs');
const MARCA_HOOK = 'hook-userpromptsubmit.mjs';

async function leerSettings() {
  return JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
}

async function backupSettings() {
  const destino = path.join(BACKUPS_DIR, `settings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.copyFile(SETTINGS_FILE, destino);
  return destino;
}

async function escribirSettings(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

async function leerMarcas() {
  try { return JSON.parse(await fs.readFile(INTEGRACIONES_FILE, 'utf8')); } catch { return {}; }
}

async function guardarMarcas(m) {
  await fs.writeFile(INTEGRACIONES_FILE, JSON.stringify(m, null, 2));
}

export async function estadoIntegraciones() {
  let settings = {};
  try { settings = await leerSettings(); } catch { /* sin settings */ }
  const comandoStatusline = settings.statusLine?.command || '';
  const hooksUps = settings.hooks?.UserPromptSubmit || [];
  const hookInstalado = JSON.stringify(hooksUps).includes(MARCA_HOOK);
  return {
    statusline: comandoStatusline.includes('statusline-advisor.ps1'),
    hook: hookInstalado,
    autostart: await autostartInstalado(),
  };
}

async function instalarStatusline() {
  asegurarDirectoriosDatos();
  await backupSettings();
  const settings = await leerSettings();
  const marcas = await leerMarcas();
  if (!settings.statusLine?.command?.includes('statusline-advisor.ps1')) {
    marcas.statuslineAnterior = settings.statusLine || null;
    await guardarMarcas(marcas);
  }
  await fs.copyFile(PLANTILLA_WRAPPER, STATUSLINE_WRAPPER_DEST);
  settings.statusLine = {
    type: 'command',
    command: `powershell -NoProfile -ExecutionPolicy Bypass -File "${STATUSLINE_WRAPPER_DEST}"`,
  };
  await escribirSettings(settings);
  return { ok: true, mensaje: 'Statusline instalado (el original se conserva y se sigue mostrando)' };
}

async function desinstalarStatusline() {
  await backupSettings();
  const settings = await leerSettings();
  const marcas = await leerMarcas();
  if (marcas.statuslineAnterior) {
    settings.statusLine = marcas.statuslineAnterior;
  } else {
    delete settings.statusLine;
  }
  await escribirSettings(settings);
  try { await fs.unlink(STATUSLINE_WRAPPER_DEST); } catch { /* ya no existe */ }
  return { ok: true, mensaje: 'Statusline restaurado al original' };
}

async function instalarHook() {
  await backupSettings();
  const settings = await leerSettings();
  settings.hooks = settings.hooks || {};
  const lista = settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
  if (!JSON.stringify(lista).includes(MARCA_HOOK)) {
    lista.push({
      hooks: [{ type: 'command', command: `"${process.execPath}" "${RUTA_HOOK}"`, timeout: 5 }],
    });
    await escribirSettings(settings);
  }
  return { ok: true, mensaje: 'Hook UserPromptSubmit instalado (efectivo en sesiones nuevas)' };
}

async function desinstalarHook() {
  await backupSettings();
  const settings = await leerSettings();
  const lista = settings.hooks?.UserPromptSubmit;
  if (Array.isArray(lista)) {
    settings.hooks.UserPromptSubmit = lista.filter((e) => !JSON.stringify(e).includes(MARCA_HOOK));
    if (!settings.hooks.UserPromptSubmit.length) delete settings.hooks.UserPromptSubmit;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
    await escribirSettings(settings);
  }
  return { ok: true, mensaje: 'Hook desinstalado' };
}

export async function aplicarIntegracion(cual, accion) {
  const instalar = accion === 'instalar';
  if (accion !== 'instalar' && accion !== 'desinstalar') throw new Error(`acción inválida: ${accion}`);
  switch (cual) {
    case 'statusline': return instalar ? instalarStatusline() : desinstalarStatusline();
    case 'hook': return instalar ? instalarHook() : desinstalarHook();
    case 'autostart': return instalar ? instalarAutostart() : desinstalarAutostart();
    default: throw new Error(`integración desconocida: ${cual}`);
  }
}

// CLI: node src/integrations/installer.js <statusline|hook|autostart> <instalar|desinstalar|estado>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cual, accion] = process.argv.slice(2);
  if (accion === 'estado' || !cual) {
    estadoIntegraciones().then((e) => console.log(JSON.stringify(e, null, 2)));
  } else {
    aplicarIntegracion(cual, accion)
      .then((r) => console.log(r.mensaje))
      .catch((e) => { console.error(String(e.message || e)); process.exit(1); });
  }
}
