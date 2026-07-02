#!/usr/bin/env node
// Hook UserPromptSubmit (opt-in): consulta al daemon local y devuelve el
// consejo como additionalContext. Si el daemon no responde en 250 ms, sale en
// silencio: JAMÁS bloquea la conversación.
import { readFileSync } from 'node:fs';
import path from 'node:path';

let puerto = 4977;
try {
  const cfg = JSON.parse(readFileSync(path.join(process.env.LOCALAPPDATA || '', 'ai-usage-advisor', 'config.json'), 'utf8'));
  if (Number.isFinite(cfg.puerto)) puerto = cfg.puerto;
} catch { /* config por defecto */ }

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', async () => {
  try {
    const data = JSON.parse(input);
    if (!data.prompt) process.exit(0);
    const res = await fetch(`http://127.0.0.1:${puerto}/api/hook/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: data.prompt, session_id: data.session_id || null }),
      signal: AbortSignal.timeout(250),
    });
    if (!res.ok) process.exit(0);
    const j = await res.json();
    if (j && j.bloquear && j.motivoBloqueo) {
      // Modo puerta: detiene el prompt y muestra el motivo al usuario.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: j.motivoBloqueo }));
    } else if (j && j.texto) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: j.texto },
      }));
    }
  } catch { /* daemon apagado o lento: silencio */ }
  process.exit(0);
});
