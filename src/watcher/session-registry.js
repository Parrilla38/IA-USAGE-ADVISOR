import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { SESSIONS_DIR, CLASSIFIER_CWD } from '../paths.js';
import { log } from '../logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Observa ~/.claude/sessions/*.json (una entrada por proceso vivo de Claude Code)
 * y emite: 'nueva' (sesión), 'actualizada' (sesión), 'cerrada' (sessionId).
 */
export class SessionRegistry extends EventEmitter {
  constructor({ inactivoMs = 10 * 60 * 1000 } = {}) {
    super();
    this.inactivoMs = inactivoMs;
    this.sesiones = new Map(); // sessionId → info
    this.porFichero = new Map(); // ruta fichero → sessionId
    this.watcher = null;
    this.sweepTimer = null;
  }

  todas() { return [...this.sesiones.values()]; }

  async start() {
    this.watcher = chokidar.watch(SESSIONS_DIR, { ignoreInitial: false, depth: 0 });
    this.watcher.on('add', (p) => this.#leer(p));
    this.watcher.on('change', (p) => this.#leer(p));
    this.watcher.on('unlink', (p) => this.#quitarPorFichero(p));
    this.watcher.on('error', (e) => log.warn(`session-registry watcher: ${e.message}`));
    this.sweepTimer = setInterval(() => this.#sweep(), 60_000);
  }

  async stop() {
    clearInterval(this.sweepTimer);
    if (this.watcher) await this.watcher.close();
  }

  async #leer(fichero) {
    if (!fichero.endsWith('.json')) return;
    for (let intento = 0; intento < 3; intento++) {
      try {
        const data = JSON.parse(await fs.readFile(fichero, 'utf8'));
        this.#alta(fichero, data);
        return;
      } catch {
        await sleep(150); // posible escritura a medias
      }
    }
  }

  #alta(fichero, data) {
    if (!data || !data.sessionId) return;
    // Nunca auto-observarse: las llamadas headless del clasificador corren en CLASSIFIER_CWD
    if (data.cwd && path.resolve(data.cwd) === path.resolve(CLASSIFIER_CWD)) return;
    if (data.kind && data.kind !== 'interactive') return; // solo sesiones interactivas
    const info = {
      fichero,
      pid: data.pid,
      sessionId: data.sessionId,
      cwd: data.cwd || '',
      nombre: data.name || path.basename(data.cwd || '') || data.sessionId.slice(0, 8),
      estado: data.status || '',
      updatedAt: data.updatedAt || null,
      startedAt: data.startedAt || null,
    };
    const previa = this.sesiones.get(data.sessionId);
    this.sesiones.set(data.sessionId, info);
    this.porFichero.set(fichero, data.sessionId);
    this.emit(previa ? 'actualizada' : 'nueva', info);
  }

  #quitarPorFichero(fichero) {
    const id = this.porFichero.get(fichero);
    if (!id) return;
    this.porFichero.delete(fichero);
    if (this.sesiones.delete(id)) this.emit('cerrada', id);
  }

  #sweep() {
    const ahora = Date.now();
    for (const [id, info] of this.sesiones) {
      let viva = true;
      if (info.pid) {
        try { process.kill(info.pid, 0); } catch (e) { if (e.code === 'ESRCH') viva = false; }
      }
      const ts = Date.parse(info.updatedAt || '') || 0;
      if (ts && ahora - ts > this.inactivoMs) viva = false;
      if (!viva) {
        this.sesiones.delete(id);
        this.porFichero.delete(info.fichero);
        this.emit('cerrada', id);
      }
    }
  }
}
