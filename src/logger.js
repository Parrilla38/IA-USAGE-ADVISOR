import fs from 'node:fs';
import { LOG_FILE } from './paths.js';

const MAX_BYTES = 5 * 1024 * 1024;

export function rotarLogSiHaceFalta() {
  try {
    if (fs.statSync(LOG_FILE).size > MAX_BYTES) {
      try { fs.unlinkSync(LOG_FILE + '.old'); } catch { /* no existía */ }
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch { /* no existe aún */ }
}

function escribir(nivel, msg) {
  const linea = `${new Date().toISOString()} [${nivel}] ${msg}`;
  // eslint-disable-next-line no-console
  console.log(linea);
  fs.appendFile(LOG_FILE, linea + '\n', () => {});
}

export const log = {
  info: (m) => escribir('INFO', m),
  warn: (m) => escribir('WARN', m),
  error: (m) => escribir('ERROR', m),
};
