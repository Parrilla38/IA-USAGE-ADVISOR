import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { anotarFeedback, leerRecomendaciones, calcularMetricas } from '../output/history-store.js';
import { estadoIntegraciones, aplicarIntegracion } from '../integrations/installer.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const WIDGET_PS1 = path.join(PUBLIC_DIR, '..', 'scripts', 'widget.ps1');

/**
 * API REST + dashboard estático. Solo escucha en 127.0.0.1.
 * deps: { config, snapshot(), broadcast(type,payload), recomendarRapido(prompt, sessionId), notificador }
 */
export function crearApp(deps) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/estado', (req, res) => res.json(deps.snapshot()));

  app.get('/api/config', (req, res) => res.json(deps.config.get()));
  app.put('/api/config', (req, res) => {
    const nueva = deps.config.actualizar(req.body || {});
    deps.broadcast('config', nueva);
    res.json(nueva);
  });

  app.post('/api/feedback', async (req, res) => {
    const { recId, util, comentario } = req.body || {};
    if (!recId || typeof util !== 'boolean') return res.status(400).json({ error: 'recId y util (boolean) requeridos' });
    await anotarFeedback({
      id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      ts: new Date().toISOString(),
      recId,
      util,
      comentario: comentario || null,
    });
    deps.broadcast('feedback_ack', { recId, util });
    res.json({ ok: true });
  });

  app.get('/api/historial', async (req, res) => {
    res.json(await leerRecomendaciones({ dias: Number(req.query.dias) || 7 }));
  });

  app.get('/api/metricas', async (req, res) => res.json(await calcularMetricas()));

  app.get('/api/integraciones', async (req, res) => res.json(await estadoIntegraciones()));
  app.post('/api/integraciones/:cual', async (req, res) => {
    try {
      res.json(await aplicarIntegracion(req.params.cual, req.body?.accion));
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/widget', (req, res) => {
    try {
      spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', WIDGET_PS1], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/toast-prueba', (req, res) => {
    deps.notificador.prueba();
    res.json({ ok: true });
  });

  // Endpoint del hook UserPromptSubmit: SOLO capa 1, presupuesto <300 ms
  app.post('/api/hook/prompt', (req, res) => {
    const { prompt, session_id: sessionId } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt requerido' });
    res.json(deps.recomendarRapido(String(prompt), sessionId || null));
  });

  return app;
}
