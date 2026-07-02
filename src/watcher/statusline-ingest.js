import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { STATUSLINE_SNAPSHOT_DIR } from '../paths.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * El wrapper del statusline vuelca el JSON que Claude Code le pasa por stdin en
 * %LOCALAPPDATA%\ai-usage-advisor\statusline\<sessionId>.json. Única fuente de
 * % de contexto y rate limits. Emite: 'datos'.
 */
export class StatuslineIngest extends EventEmitter {
  constructor() {
    super();
    this.watcher = null;
  }

  async start() {
    this.watcher = chokidar.watch(STATUSLINE_SNAPSHOT_DIR, { ignoreInitial: false, depth: 0 });
    this.watcher.on('add', (p) => this.#leer(p));
    this.watcher.on('change', (p) => this.#leer(p));
    this.watcher.on('error', () => {});
  }

  async stop() {
    if (this.watcher) await this.watcher.close();
  }

  async #leer(fichero) {
    if (!fichero.endsWith('.json')) return;
    for (let i = 0; i < 3; i++) {
      try {
        const data = JSON.parse(await fs.readFile(fichero, 'utf8'));
        const sessionId = data.session_id || path.basename(fichero, '.json');
        this.emit('datos', {
          sessionId,
          modeloId: data.model?.id || null,
          modeloNombre: data.model?.display_name || null,
          ctxPct: num(data.context_window?.used_percentage),
          cuota5h: num(data.rate_limits?.five_hour?.used_percentage),
          reset5h: data.rate_limits?.five_hour?.reset_at || null,
          cuotaSemana: num(data.rate_limits?.week?.used_percentage),
        });
        return;
      } catch {
        await sleep(100);
      }
    }
  }
}
