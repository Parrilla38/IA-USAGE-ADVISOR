import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const HOME = os.homedir();
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

// Ficheros de Claude Code (SOLO LECTURA, jamás escribir aquí salvo installer con backup)
export const CLAUDE_DIR = path.join(HOME, '.claude');
export const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
export const STATUSLINE_ORIGINAL = path.join(CLAUDE_DIR, 'statusline-command.ps1');
export const STATUSLINE_WRAPPER_DEST = path.join(CLAUDE_DIR, 'statusline-advisor.ps1');

// Datos propios de la aplicación
export const DATA_DIR = path.join(LOCALAPPDATA, 'ai-usage-advisor');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const STATE_FILE = path.join(DATA_DIR, 'current.json');
export const STATUSLINE_SNAPSHOT_DIR = path.join(DATA_DIR, 'statusline');
export const CLASSIFIER_CWD = path.join(DATA_DIR, 'classifier-cwd');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const HISTORY_DIR = path.join(DATA_DIR, 'history');
export const INTEGRACIONES_FILE = path.join(DATA_DIR, 'integraciones.json');
export const LOG_FILE = path.join(DATA_DIR, 'daemon.log');

export function asegurarDirectoriosDatos() {
  for (const d of [DATA_DIR, STATUSLINE_SNAPSHOT_DIR, CLASSIFIER_CWD, BACKUPS_DIR, HISTORY_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
