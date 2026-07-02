/**
 * Léxico ES/EN por tipo de tarea. El orden importa: lo más específico primero.
 * "ambigua fuerte" se evalúa pronto (frases inequívocamente vagas); los verbos
 * vagos sueltos ("mejora", "optimiza") solo al final, como último recurso.
 */
const PRIORIDAD = [
  ['refactor_masivo', /\b(todo el (repo|proyecto|c[oó]digo|backend|frontend)|toda la (app|aplicaci[oó]n|base de c[oó]digo|web)|whole (repo|project|codebase)|entire (repo|project|codebase)|migraci[oó]n de framework|cambia(r)? de framework|reescribe todo)\b/i],
  ['arquitectura', /\b(arquitectura|architecture|dise[ñn]a|dise[ñn]o|planifica|plan de|estrategia|roadmap|spec|prd|requisitos|c[oó]mo (deber[ií]a )?estructurar|qu[eé] enfoque|trade-?offs?|decisi[oó]n t[eé]cnica|propuesta t[eé]cnica)\b/i],
  ['ambigua', /\b(haz que funcione|arregla todo|hazlo (mejor|m[aá]s r[aá]pido)|make it (work|better)|mejora la (app|aplicaci[oó]n|web|p[aá]gina)|improve the (app|site))\b/i],
  ['debugging_duro', /\b(intermitente|a veces (falla|funciona)|falla a veces|race condition|deadlock|sigue fallando|sigue sin funcionar|otra vez (el mismo|falla)|memory leak|fuga de memoria|aleatoriamente|random(ly)? fail(s|ing)?|heisenbug|no consigo (arreglar|que funcione)|llevo (horas|d[ií]as))\b/i],
  ['refactor', /\b(refactoriza|refactor|migra(r)?|migrate|reestructura|restructure|reorganiza|desacopla|decouple|moderniza|split .{0,40} into)\b/i],
  ['revision', /\b(revisa|review|code review|busca (bugs|errores|fallos|problemas)|audita|audit|revisi[oó]n de c[oó]digo|est[aá] bien (este|mi) c[oó]digo)\b/i],
  ['formateo', /\b(formatea|format(ea)?|ordena (los )?imports|renombra|rename|convierte\b.{0,40}\b(json|ya?ml|csv|xml|markdown)|minifica|indenta|prettier|mensaje de commit|commit message|alfab[eé]ticamente)\b/i],
  ['debugging', /\b(error|falla|fallo|no funciona|no compila|no carga|arregla|fix|bug|excepci[oó]n|exception|crash|se rompe|roto|broken|traceback|stack trace|undefined|nullpointer|404|500)\b/i],
  ['comandos', /^[¿¡"']*(ejecuta|corre|lanza|instala|desinstala|arranca|inicia|reinicia|para|det[eé]n|mata|actualiza|run|install|start|stop|restart|kill|npm|pnpm|yarn|git|pip|docker|kubectl)\b/i],
  ['edicion_puntual', /\b(corrige el typo|typo|cambia el (texto|literal|color|t[ií]tulo)|a[ñn]ade un (log|console\.log|comentario)|quita (el|la|los|las) (comentario|log|import)|cambia el nombre de la variable)\b/i],
  ['integracion', /\b(integra|integrate|conecta|connect|enlaza|vincula|hook up)\b/i],
  ['documentacion', /\b(readme|documenta|document(ation)?|docstring|jsdoc|escribe un (correo|email|informe|art[ií]culo|post|resumen)|redacta|changelog)\b/i],
  ['analisis_datos', /\b(analiza (este|el|los|estos)? ?(csv|excel|datos|dataset|fichero)|gr[aá]ficas?|charts?|plots?|estad[ií]sticas de|media y desviaci[oó]n|pandas)\b/i],
  ['codificacion', /\b(crea|implementa|a[ñn]ade|agrega|haz|escribe|desarrolla|m[oó]nta(?:me|r)?|create|implement|add|write|build)\b[\s\S]{0,200}?\b(funci[oó]n|function|endpoint|componente|component|tests?|pruebas?|clase|class|m[eé]todo|method|bot[oó]n|button|p[aá]gina|page|modal|formulario|form|api|ruta|route|hook|servicio|service|script|validaci[oó]n|feature|men[uú]|tabla|dashboard|panel)\b/i],
  ['pregunta_rapida', /\b(qu[eé] es|qu[eé] significa|qu[eé] hace|explica|expl[ií]came|c[oó]mo se|cu[aá]l es la diferencia|diferencia entre|what is|what does|explain|how do i|traduce|translate|por qu[eé])\b/i],
  ['ambigua', /\b(mejora|mej[oó]ralo|optimiza|optim[ií]zalo|improve|pulir|p[uú]lelo)\b/i],
];

/** Devuelve el id de tipo de tarea detectado, o null si nada casa. */
export function detectarTipo(texto) {
  for (const [tipo, re] of PRIORIDAD) {
    if (re.test(texto)) return tipo;
  }
  return null;
}
