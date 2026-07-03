/**
 * Léxico ES/EN puntuado. Cada regla que casa suma su peso al tipo; gana el tipo
 * con más puntos (los empates los resuelve heuristics.js a favor del grupo de
 * mayor capacidad: quedarse corto cuesta más que pasarse).
 *
 * Pesos: 3 = inequívoco · 2.5 = muy fuerte · 2 = fuerte · 1.5 = indicativo ·
 * 1 = débil · 0.5 = último recurso (verbos vagos tipo "mejora").
 * Un tipo puede tener varias reglas: más señales independientes → más puntos,
 * y heuristics.js lo traduce en más confianza.
 */
export const REGLAS = [
  // --- Específicos de alto valor primero (fija orden de inserción p/ empates) ---
  ['seguridad', 3, /\b(vulnerabilidad(es)?|vulnerabilit(y|ies)|xss|csrf|sql injection|inyecci[oó]n (sql|de comandos)|path traversal|owasp|pentest(ing)?|escalada de privilegios|privilege escalation)\b/i],
  ['seguridad', 2, /\b(audita(r)? (la )?seguridad|security (audit|review)|revisa la seguridad|es seguro (este|el|mi)|fallo de seguridad|agujero de seguridad|secretos? (expuestos?|filtrados?|en el (repo|c[oó]digo))|api key (expuesta|filtrada)|leaked (secret|key|credential)s?)\b/i],

  ['refactor_masivo', 3, /\b(todo el (repo(sitorio)?|monorepo|proyecto|c[oó]digo|backend|frontend)|toda la (app|aplicaci[oó]n|base de c[oó]digo|web|plataforma)|whole (repo|project|codebase)|entire (repo|project|codebase)|reescribe todo|rewrite everything|todos los (m[oó]dulos|servicios|componentes))\b/i],
  ['refactor_masivo', 3, /\b(migraci[oó]n de framework|cambia(r)? de framework|reescritura completa|(reescr[ií]be(lo)?|rehaz(lo)?|rewrite)\b.{0,40}\b(desde cero|from scratch))\b/i],

  ['arquitectura', 2.5, /\b(arquitectura|architecture|planifica|plan de|roadmap|spec|prd|requisitos|estrategia|strategy|decisi[oó]n t[eé]cnica|propuesta t[eé]cnica|modelo de datos|esquema de (la )?base de datos|data model|system design)\b/i],
  ['arquitectura', 2, /\b(dise[ñn]a(me|r)?)\b|\bdise[ñn]o de (un|una|la|el|los|las)? ?(sistema|servicio|api|plataforma|m[oó]dulo|flujo|esquema|soluci[oó]n)\b/i],
  ['arquitectura', 1.5, /\b(qu[eé] enfoque|c[oó]mo (deber[ií]a|conviene|habr[ií]a que) (estructurar|organizar|plantear|abordar)|how (should|would) (i|we|you) (structure|approach|organize|design)|trade-?offs?|pros y contras|ventajas y desventajas|qu[eé] (opinas|recomiendas|elegir[ií]as)|me recomiendas|recomendar[ií]as|escalabilidad|scalability|a gran escala|(at|large) scale|monolito|microservicios|multi-?tenant|prop[oó]n(me)?|alternativas para)\b/i],

  ['ambigua', 3, /\b(haz que funcione|arregla todo|arregla lo que (haga falta|sea)|todo lo que haga falta|hazlo (mejor|m[aá]s r[aá]pido|bonito)|make it (work|better)|mejora la (app|aplicaci[oó]n|web|p[aá]gina)|improve the (app|site)|que (todo )?funcione)\b/i],

  ['debugging_duro', 3, /\b(race condition|deadlock|memory leak|fuga de memoria|heisenbug|flaky|corrupci[oó]n de (datos|memoria)|se corrompe)\b/i],
  ['debugging_duro', 2.5, /\b(intermitente(mente)?|a veces (falla|funciona|pasa|va)|falla(n)? a veces|aleatoriamente|de forma aleatoria|random(ly)? fail(s|ing)?|solo (falla |pasa )?en producci[oó]n|only (happens |fails )?in production|en local funciona|se congela|se queda colgad[oa])\b/i],
  ['debugging_duro', 2.5, /\b(sigue(n)? (fallando|sin funcionar|rot[oa]|cay[eé]ndose)|otra vez (el mismo|falla)|no consigo (arreglar(lo)?|que funcione|reproducir)|llevo (horas|d[ií]as|toda la (tarde|ma[ñn]ana))|ya (lo )?(prob[eé]|intent[eé]) (todo|de todo|varias veces)|ya van (dos|tres|cuatro|varios) intentos|i'?ve tried everything|still (failing|broken|not working))\b/i],

  ['rendimiento', 2.5, /\b(va (muy |demasiado )?lent[oa]|tarda (mucho|much[ií]simo|\d+\s*(segundos|seg|s\b|minutos|min))|demasiado lent[oa]|too slow|very slow|cuello de botella|bottleneck|n\+1|reduce el tiempo de (carga|respuesta)|consume (mucha|demasiada) (memoria|cpu|ram)|use[sn]? too much (memory|cpu)|optimiza el rendimiento)\b/i],
  ['rendimiento', 1, /\b(rendimiento|performance|latencia|latency)\b/i],

  ['refactor', 2, /\b(refactoriza(r)?|refactor(ing)?|migra(r|ci[oó]n)?|migrate|migration|reestructura(r)?|restructure|reorganiza(r)?|desacopla(r)?|decouple|moderniza(r)?|reescribe|extrae la l[oó]gica|extract the \w+ logic|separa (la l[oó]gica|las capas|responsabilidades)|split\b.{0,40}\binto)\b/i],

  ['revision', 2.5, /\b(code review|revisi[oó]n de c[oó]digo|audita(r)? (el|este|mi) c[oó]digo|audit (the|this|my) code|revisa (mi|el|este|esta) (pr|pull request|diff|rama|branch|commit))\b/i],
  ['revision', 2, /\b(revisa(r|me)?|review|busca (bugs|errores|fallos|problemas)|est[aá] bien (este|mi|el) c[oó]digo|look for (bugs|issues)|code smells?|dime si hay (problemas|errores|fallos|bugs)|hay algo (mal|raro) en)\b/i],

  ['formateo', 2, /\b(formatea(r)?|format(ea)?|ordena (los |las )?(imports?|claves|propiedades|l[ií]neas)|renombra|rename|minifica|indenta|prettier|eslint --fix|alfab[eé]ticamente|mensaje de commit|commit message|trailing whitespace)\b/i],
  ['formateo', 2, /\bconvierte\b.{0,50}\b(json|ya?ml|csv|xml|markdown|iso|snake_?case|camel ?case|may[uú]sculas|min[uú]sculas)\b/i],

  ['debugging', 2, /\b((?<!c[oó]digos de )error(es)?|excepci[oó]n|exception|crash(ea)?|traceback|stack ?trace|undefined|null ?pointer|npe|404|500|segfault|panic)\b/i],
  ['debugging', 2, /\b(no (funciona|compila|carga|arranca|renderiza|responde|conecta|guarda|abre|aparece|actualiza)|falla(n)?|fallo|arregla(r|lo)?|fix(ea|ealo)?|bug|depura(r)?|debug\b|se rompe|se rompi[oó]|roto|broken|deja de funcionar|dej[oó] de funcionar|stopped working|doesn'?t work|not working|se queda (en blanco|bloqueado|deshabilitado|pillado))\b/i],

  ['comandos', 2, /^[¿¡"'\s]*(ejecuta|corre|lanza|instala|desinstala|arranca|inicia|reinicia|para (?!que\b)|det[eé]n|mata|actualiza|compila|despliega|deploy|run|install|start|stop|restart|kill|build|npm|pnpm|yarn|git|pip|docker|kubectl|node)\b/i],
  ['comandos', 1, /\b(git (status|log|diff|push|pull|commit|checkout|rebase|merge|stash)|npm (install|run|test|start|ci)|docker (compose|build|run|ps)|pip install)\b/i],

  ['edicion_puntual', 2, /\b(corrige el typo|typo|cambia el (texto|literal|color|t[ií]tulo|placeholder|valor|nombre|icono|label)|a[ñn]ade un (log|console\.log|comentario|import)|quita (el|la|los|las) (comentario|log|import|bot[oó]n|borde)|cambia el nombre de (la variable|la funci[oó]n)|sube la versi[oó]n|bump (the )?version|actualiza la (dependencia|versi[oó]n)|ajusta el (estilo|margen|padding|color|tama[ñn]o)|cambia el dise[ñn]o de|esconde (el|la)|oculta (el|la))\b/i],

  ['integracion', 2, /\b(integra(r)?|integrate|conecta(r)?|connect|enlaza(r)?|vincula(r)?|hook up)\b/i],

  ['documentacion', 2, /\b(readme|documenta(r|ci[oó]n)?|document(ation)?|docstring|jsdoc|changelog|escribe (un|una) (correo|email|informe|art[ií]culo|post|resumen|gu[ií]a|tutorial)|redacta(r)?|comenta el c[oó]digo|a[ñn]ade comentarios)\b/i],
  // Documentación mecánica: debe pesar más que "escribe … función" de codificación
  ['documentacion', 2.5, /\b(docstring|jsdoc|comenta el c[oó]digo|a[ñn]ade comentarios|coment[aá]ndolo)\b/i],

  ['analisis_datos', 2, /\b(analiza (este|el|los|estos|la|las)? ?(csv|excel|datos|dataset|fichero|logs?|m[eé]tricas)|gr[aá]ficas?|charts?|plots?|estad[ií]sticas de|media y desviaci[oó]n|pandas|agrupa por|group by|histograma|correlaci[oó]n)\b/i],

  ['codificacion', 2, /\b(crea(r|me)?|implementa(r)?|a[ñn]ade|agrega(r)?|haz(me)?|escribe|desarrolla(r)?|m[oó]nta(me|r)?|create|implement|add|write|build)\b[\s\S]{0,200}?\b(funci[oó]n|function|endpoint|componente|component|tests?|pruebas?|clase|class|m[eé]todo|method|bot[oó]n|button|p[aá]gina|page|modal|formulario|form|api|ruta|route|hook|servicio|service|script|validaci[oó]n|feature|funcionalidad|men[uú]|tabla|dashboard|panel|middleware|worker|cron|webhook|paginaci[oó]n|autenticaci[oó]n|login|b[uú]squeda|filtro|cach[eé]|parser|comando|cli|vista|view|layout|animaci[oó]n|soporte|opci[oó]n|campo|columna|toggle|switch)\b/i],
  ['codificacion', 1, /\b(crea|implementa|a[ñn]ade|agrega|desarrolla|escribe|create|implement|add|build)\b/i],

  ['pregunta_rapida', 2, /\b(qu[eé] (es|significa|hace|hacen|devuelve)|expl[ií]came|explica(me)?|explain|c[oó]mo (se usa|funciona|se hace)|cu[aá]l es la diferencia|diferencia entre|what (is|does|are)|how do(es)? (i|it|this)|por qu[eé]|why (is|does)|traduce|translate|d[oó]nde (est[aá]|se define|se usa)|where is|res[uú]me(me|lo)?|summarize)\b/i],

  ['ambigua', 0.5, /\b(mejora(r|lo)?|optimiza(r|lo)?|improve|pulir|p[uú]le(lo)?|arregla esto)\b/i],
];

/** Confirmación pura ("sí", "ok, hazlo"): el texto completo es un asentimiento. */
export const RE_ACK = /^[\s"'¡¿]*(s[ií]|ok(ey)?|vale|venga|perfecto|genial|claro|de acuerdo|correcto|yes|yep|sure)[\s,.!…]*(hazlo|dale|adelante|contin[uú]a|procede|go ahead|do it)?[\s.!…]*$/i;

/** Orden de continuar ("continúa", "siguiente paso") al inicio de un prompt corto. */
export const RE_CONTINUACION = /^[¿¡"'\s]*(contin[uú]a|sigue(?!\s+(fallando|sin|rot))|dale|adelante|venga|hazlo|procede|prosigue|continue|go ahead|next|siguiente|do it|keep going)\b/i;

/** Puntúa el texto contra todas las reglas. → Map tipo → puntos acumulados. */
export function puntuar(texto) {
  const p = new Map();
  for (const [tipo, peso, re] of REGLAS) {
    if (re.test(texto)) p.set(tipo, (p.get(tipo) || 0) + peso);
  }
  return p;
}

/** Compatibilidad: id del tipo con más puntos, o null. */
export function detectarTipo(texto) {
  let mejor = null;
  for (const [tipo, pts] of puntuar(texto)) {
    if (!mejor || pts > mejor.pts) mejor = { tipo, pts };
  }
  return mejor?.tipo ?? null;
}
