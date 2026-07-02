/** Consejos ortogonales al modelo: contexto, cuota, resets. */
export function consejos(s, cfg) {
  const u = cfg.umbrales || {};
  const out = [];
  if (s.ctxPct != null) {
    if (s.ctxPct >= (u.ctxSesionNueva ?? 90)) {
      out.push({ tipo: 'sesion_nueva', texto: `Contexto al ${Math.round(s.ctxPct)}%: mejor abrir sesión nueva con un resumen` });
    } else if (s.ctxPct >= (u.ctxCompact ?? 75)) {
      out.push({ tipo: 'compact', texto: `Contexto al ${Math.round(s.ctxPct)}%: considera /compact` });
    }
  }
  if (s.cuota5h != null) {
    if (s.cuota5h >= (u.cuotaCritica ?? 95)) {
      let hora = '';
      if (s.reset5h) {
        try { hora = ` (reset ${new Date(s.reset5h).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})`; } catch { /* fecha rara */ }
      }
      out.push({ tipo: 'reset', texto: `Cuota 5h al ${Math.round(s.cuota5h)}%: considera esperar al reset${hora}` });
    } else if (s.cuota5h >= (u.cuota5hAlta ?? 80)) {
      out.push({ tipo: 'cuota', texto: `Cuota 5h al ${Math.round(s.cuota5h)}%` });
    }
  }
  if (s.cuotaSemana != null && s.cuotaSemana >= (u.cuotaSemanaAlta ?? 85)) {
    out.push({ tipo: 'cuota_semana', texto: `Cuota semanal al ${Math.round(s.cuotaSemana)}%` });
  }
  return out;
}
