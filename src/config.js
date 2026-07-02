import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { CONFIG_FILE } from './paths.js';

const RUTA_DEFAULTS = new URL('../config.default.json', import.meta.url);

function mergeProfundo(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = mergeProfundo(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class Config extends EventEmitter {
  constructor() {
    super();
    this.defaults = JSON.parse(fs.readFileSync(RUTA_DEFAULTS, 'utf8'));
    let usuario = {};
    try { usuario = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* sin config de usuario */ }
    this.valores = mergeProfundo(this.defaults, usuario);
  }

  get() { return this.valores; }

  actualizar(parcial) {
    this.valores = mergeProfundo(this.valores, parcial);
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.valores, null, 2)); } catch { /* mejor esfuerzo */ }
    this.emit('cambio', this.valores);
    return this.valores;
  }
}
