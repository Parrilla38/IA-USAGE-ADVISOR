import { mapearModelo } from '../engine/modelos.js';

/** Estado acumulado de una sesión de Claude Code, alimentado por eventos del transcript. */
export class SessionState {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.turnos = 0;
    this.tokens = { entrada: 0, salida: 0, cacheCreado: 0, cacheLeido: 0 };
    this.modeloActualId = null;
    this.cwd = null;
    this.gitBranch = null;
    this.ultimoPrompt = null;
    this.resultadosTools = []; // últimos 10; true = error
    this.attachmentsPendientes = 0;
    this.attachmentsTurno = 0;
    this.ultimoSidechainTs = 0;
    this.ultimaActividadTs = 0;
    this.statusline = { ctxPct: null, cuota5h: null, cuotaSemana: null, reset5h: null, modeloId: null };
    this.ultimaRec = null;
    // Acumuladores del turno en curso (para el etiquetado implícito)
    this.turnoRec = null;      // recomendación emitida para este turno
    this.modeloTurno = null;   // modelo realmente usado en este turno
    this.erroresTurno = 0;     // errores de herramienta dentro del turno
  }

  /**
   * Cierra el turno en curso (se llama al llegar el prompt siguiente) y
   * devuelve su resumen para etiquetarlo, o null si no hubo recomendación.
   */
  cerrarTurno() {
    if (!this.turnoRec) return null;
    const cerrado = {
      rec: this.turnoRec,
      modeloUsado: this.modeloTurno,
      erroresTurno: this.erroresTurno,
      promptAnterior: this.ultimoPrompt,
    };
    this.turnoRec = null;
    return cerrado;
  }

  aplicar(ev) {
    const ts = Date.parse(ev.ts || '') || Date.now();
    if (ts > this.ultimaActividadTs) this.ultimaActividadTs = ts;
    switch (ev.kind) {
      case 'prompt':
        this.turnos++;
        this.ultimoPrompt = ev.texto;
        this.attachmentsTurno = this.attachmentsPendientes;
        this.attachmentsPendientes = 0;
        this.modeloTurno = null;
        this.erroresTurno = 0;
        if (ev.cwd) this.cwd = ev.cwd;
        if (ev.gitBranch) this.gitBranch = ev.gitBranch;
        break;
      case 'assistant':
        if (ev.modelo) {
          this.modeloActualId = ev.modelo;
          this.modeloTurno = mapearModelo(ev.modelo) || this.modeloTurno;
        }
        if (ev.usage) {
          this.tokens.entrada += ev.usage.input_tokens || 0;
          this.tokens.salida += ev.usage.output_tokens || 0;
          this.tokens.cacheCreado += ev.usage.cache_creation_input_tokens || 0;
          this.tokens.cacheLeido += ev.usage.cache_read_input_tokens || 0;
        }
        break;
      case 'tool_result':
        this.erroresTurno += ev.errores || 0;
        for (let i = 0; i < (ev.total || 0); i++) {
          this.resultadosTools.push(i < (ev.errores || 0));
        }
        if (this.resultadosTools.length > 10) {
          this.resultadosTools = this.resultadosTools.slice(-10);
        }
        break;
      case 'attachment':
        this.attachmentsPendientes++;
        break;
      case 'sidechain':
        this.ultimoSidechainTs = ts;
        break;
      default:
        break;
    }
  }

  aplicarStatusline(d) {
    if (d.ctxPct != null) this.statusline.ctxPct = d.ctxPct;
    if (d.cuota5h != null) this.statusline.cuota5h = d.cuota5h;
    if (d.cuotaSemana != null) this.statusline.cuotaSemana = d.cuotaSemana;
    if (d.reset5h) this.statusline.reset5h = d.reset5h;
    if (d.modeloId) this.statusline.modeloId = d.modeloId;
  }

  get rachaErrores() {
    let n = 0;
    for (let i = this.resultadosTools.length - 1; i >= 0; i--) {
      if (this.resultadosTools[i]) n++;
      else break;
    }
    return n;
  }

  get subagentesActivos() {
    return this.ultimoSidechainTs > 0 && this.ultimaActividadTs - this.ultimoSidechainTs < 2 * 60_000;
  }

  get modeloActual() {
    return mapearModelo(this.modeloActualId || this.statusline.modeloId);
  }

  get tokensAcumulados() {
    return this.tokens.entrada + this.tokens.salida + this.tokens.cacheLeido;
  }
}
