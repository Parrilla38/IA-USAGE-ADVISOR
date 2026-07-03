const RE_RUTA = /[\w\-./\\]{2,}\.(mjs|cjs|jsx?|tsx?|py|json|mdx?|css|s[ac]ss|html?|ps1|ya?ml|java|go|rs|cpp|cc|h|cs|php|rb|sql|sh|bat|toml|ini|cfg|txt|vue|svelte)\b/gi;
const RE_REPO_ENTERO = /\b(todo el (repo|proyecto|c[oó]digo|backend|frontend)|toda la (app|aplicaci[oó]n|base de c[oó]digo|web)|whole (repo|project|codebase)|entire (repo|project|codebase)|todos los (ficheros|archivos)|reescribe todo)\b/i;
const RE_PALABRA_CODIGO = /\b(function|const|let|var|def|class|import|export|return|async|await|=>|public|private|void|interface)\b/;

export function densidadCodigo(texto) {
  let p = 0;
  if (/```/.test(texto)) p += 0.5;
  const simbolos = (texto.match(/[{};=()<>[\]]/g) || []).length;
  p += Math.min(0.4, (simbolos / Math.max(40, texto.length)) * 4);
  if (RE_PALABRA_CODIGO.test(texto)) p += 0.2;
  if (RE_RUTA.test(texto)) p += 0.1;
  RE_RUTA.lastIndex = 0;
  return Math.min(1, Math.round(p * 100) / 100);
}

/** Vector de señales de un turno: prompt + estado de sesión + statusline + config. */
export function extraerSenales(texto, estado, cfg, esfuerzoActual) {
  const palabras = (texto.trim().match(/\S+/g) || []).length;
  const lineas = texto.split('\n').length;
  const ficheros = new Set((texto.match(RE_RUTA) || []).map((f) => f.toLowerCase())).size;
  RE_RUTA.lastIndex = 0;
  return {
    texto: texto.slice(0, 800),
    palabras,
    lineas,
    densidadCodigo: densidadCodigo(texto),
    ficheros,
    attachments: estado.attachmentsTurno || 0,
    turnos: estado.turnos || 0,
    tokensAcumulados: estado.tokensAcumulados || 0,
    rachaErrores: estado.rachaErrores || 0,
    subagentes: Boolean(estado.subagentesActivos),
    modeloActual: estado.modeloActual || null,
    esfuerzoActual: esfuerzoActual || null,
    ctxPct: estado.statusline?.ctxPct ?? null,
    cuota5h: estado.statusline?.cuota5h ?? null,
    cuotaSemana: estado.statusline?.cuotaSemana ?? null,
    reset5h: estado.statusline?.reset5h ?? null,
    preferenciaLatencia: cfg.preferenciaLatencia || 'equilibrado',
    mencionRepoEntero: RE_REPO_ENTERO.test(texto),
    tipoPrevio: estado.ultimaRec?.l1?.tipoId ?? null,
    confPrevia: estado.ultimaRec?.l1?.confianza ?? null,
  };
}
