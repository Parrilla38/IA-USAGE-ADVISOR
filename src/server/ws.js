import { WebSocketServer } from 'ws';

/** WebSocket en /ws. Sobre común: { v:1, type, ts, payload }. */
export function crearWs(server, obtenerSnapshot) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    try {
      ws.send(JSON.stringify({ v: 1, type: 'snapshot', ts: new Date().toISOString(), payload: obtenerSnapshot() }));
    } catch { /* cliente cerró */ }
  });
  return {
    broadcast(type, payload) {
      const msg = JSON.stringify({ v: 1, type, ts: new Date().toISOString(), payload });
      for (const c of wss.clients) {
        if (c.readyState === 1) {
          try { c.send(msg); } catch { /* cliente roto */ }
        }
      }
    },
    close() { wss.close(); },
  };
}
