import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import chokidar from 'chokidar';

/**
 * Tail incremental de un fichero JSONL en escritura (append-only).
 * - Arranque en frío: solo la cola (colaBytes) para no reprocesar sesiones enormes.
 * - Tolera: línea partida entre escrituras, JSON malformado, truncado/reemplazo,
 *   caracteres multibyte partidos entre lecturas.
 * Emite: 'entrada' (objeto parseado), 'lineaMala', 'truncado'.
 */
export class JsonlTailer extends EventEmitter {
  constructor(ruta, { colaBytes = 256 * 1024, pollMs = 1200 } = {}) {
    super();
    this.ruta = ruta;
    this.colaBytes = colaBytes;
    this.pollMs = pollMs;
    this.offset = 0;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');
    this.saltarPrimeraParcial = false;
    this.leyendo = false;
    this.pendiente = false;
    this.lineasMalas = 0;
    this.watcher = null;
    this.poll = null;
    this.parado = false;
  }

  async start() {
    try {
      const st = await fs.stat(this.ruta);
      this.offset = Math.max(0, st.size - this.colaBytes);
      this.saltarPrimeraParcial = this.offset > 0;
    } catch { this.offset = 0; }
    await this.#leer();
    this.watcher = chokidar.watch(this.ruta, { ignoreInitial: true });
    this.watcher.on('change', () => this.#leer());
    this.watcher.on('error', () => {});
    this.poll = setInterval(() => this.#leer(), this.pollMs); // respaldo si fs.watch pierde eventos
  }

  async stop() {
    this.parado = true;
    clearInterval(this.poll);
    if (this.watcher) await this.watcher.close();
  }

  async #leer() {
    if (this.parado) return;
    if (this.leyendo) { this.pendiente = true; return; }
    this.leyendo = true;
    try {
      do {
        this.pendiente = false;
        let st;
        try { st = await fs.stat(this.ruta); } catch { break; }
        if (st.size < this.offset) {
          // Fichero truncado o reemplazado: empezar de cero
          this.offset = 0;
          this.buffer = '';
          this.decoder = new StringDecoder('utf8');
          this.saltarPrimeraParcial = false;
          this.emit('truncado');
        }
        if (st.size > this.offset) {
          let fh;
          try { fh = await fs.open(this.ruta, 'r'); } catch { break; }
          try {
            const pendientes = st.size - this.offset;
            const buf = Buffer.alloc(Math.min(pendientes, 1024 * 1024));
            let leidos = 0;
            while (leidos < pendientes) {
              const { bytesRead } = await fh.read(buf, 0, Math.min(buf.length, pendientes - leidos), this.offset + leidos);
              if (bytesRead <= 0) break;
              this.#procesar(this.decoder.write(buf.subarray(0, bytesRead)));
              leidos += bytesRead;
            }
            this.offset += leidos;
          } finally {
            await fh.close();
          }
        }
      } while (this.pendiente && !this.parado);
    } finally {
      this.leyendo = false;
    }
  }

  #procesar(texto) {
    this.buffer += texto;
    const partes = this.buffer.split('\n');
    this.buffer = partes.pop(); // la última puede estar incompleta
    for (const cruda of partes) {
      const linea = cruda.trim();
      if (this.saltarPrimeraParcial) { this.saltarPrimeraParcial = false; continue; }
      if (!linea) continue;
      try {
        this.emit('entrada', JSON.parse(linea));
      } catch {
        this.lineasMalas++;
        this.emit('lineaMala', linea.slice(0, 80));
      }
    }
  }
}
