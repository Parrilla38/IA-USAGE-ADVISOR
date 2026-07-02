const RE_META = /<command-name>|<local-command-stdout>|<system-reminder>|<local-command-caveat>|^Caveat:/;

/**
 * Convierte una línea cruda del transcript JSONL en un evento tipado, o null
 * si no aporta señal. Defensivo: solo lee campos presentes, nunca lanza.
 */
export function parsearEntrada(e) {
  if (!e || typeof e !== 'object') return null;
  switch (e.type) {
    case 'user': {
      const m = e.message;
      if (!m) return null;
      if (e.isSidechain) return { kind: 'sidechain', ts: e.timestamp };
      if (typeof m.content === 'string') {
        if (e.isMeta || RE_META.test(m.content)) return null;
        return {
          kind: 'prompt',
          texto: m.content,
          uuid: e.uuid,
          ts: e.timestamp,
          cwd: e.cwd,
          gitBranch: e.gitBranch,
          sessionId: e.sessionId,
        };
      }
      if (Array.isArray(m.content)) {
        const toolResults = m.content.filter((b) => b && b.type === 'tool_result');
        if (toolResults.length) {
          return {
            kind: 'tool_result',
            errores: toolResults.filter((b) => b.is_error === true).length,
            total: toolResults.length,
            ts: e.timestamp,
          };
        }
        const texto = m.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
        if (texto && !e.isMeta && !RE_META.test(texto)) {
          return { kind: 'prompt', texto, uuid: e.uuid, ts: e.timestamp, cwd: e.cwd, gitBranch: e.gitBranch, sessionId: e.sessionId };
        }
      }
      return null;
    }
    case 'assistant': {
      const m = e.message;
      if (!m) return null;
      if (e.isSidechain) return { kind: 'sidechain', ts: e.timestamp };
      const contenido = Array.isArray(m.content) ? m.content : [];
      return {
        kind: 'assistant',
        modelo: m.model || null,
        usage: m.usage || null,
        toolUses: contenido.filter((b) => b && b.type === 'tool_use').length,
        ts: e.timestamp,
      };
    }
    case 'attachment':
      return { kind: 'attachment', ts: e.timestamp };
    default:
      return null; // mode, summary, queue-operation, file-history-snapshot, desconocidos…
  }
}
