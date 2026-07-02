import notifier from 'node-notifier';
import { NOMBRES_MODELO } from '../engine/modelos.js';

/**
 * Toasts nativos de Windows (node-notifier → SnoreToast embebido).
 * Anti-spam: solo cuando la recomendación difiere del modelo en uso, y solo si
 * cambió respecto a la última notificada de esa sesión o pasó el cooldown.
 */
export class Notificador {
  constructor(config) {
    this.config = config;
    this.ultimo = new Map(); // sessionId → { clave, ts }
  }

  notificar(rec, nombreSesion) {
    const c = this.config.get().toasts || {};
    if (!c.activados) return false;
    if (rec.coincide !== false) return false; // solo divergencias claras
    const clave = `${rec.modelo}/${rec.esfuerzo ?? '-'}`;
    const prev = this.ultimo.get(rec.sessionId);
    const ahora = Date.now();
    const cooldownMs = (c.cooldownMinutos ?? 5) * 60_000;
    if (prev && prev.clave === clave && ahora - prev.ts < cooldownMs) return false;
    this.ultimo.set(rec.sessionId, { clave, ts: ahora });
    this.#toast(
      `Asesor IA — ${nombreSesion || 'sesión'}`,
      `Recomendado: ${NOMBRES_MODELO[rec.modelo] || rec.modelo}${rec.esfuerzo ? ` (${rec.esfuerzo})` : ''} · ${rec.tipoTarea} · conf. ${Math.round(rec.confianza * 100)}%`,
    );
    return true;
  }

  prueba() {
    this.#toast('Asesor IA', 'Notificación de prueba: todo funciona.');
  }

  #toast(title, message) {
    try {
      notifier.notify({ title, message, appID: 'Asesor de uso de IA' }, () => {});
    } catch { /* nunca tirar el daemon por un toast */ }
  }
}
