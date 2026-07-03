import test from 'node:test';
import assert from 'node:assert/strict';
import { esReintento, veredicto, construirEtiqueta } from '../src/signals/outcome.js';
import { SessionState } from '../src/signals/session-state.js';

test('esReintento: prompt idéntico (con espacios/mayúsculas distintos) es reintento', () => {
  assert.equal(esReintento('Arregla el login', ' arregla   el LOGIN '), true);
});

test('esReintento: reformulación con alto solape es reintento', () => {
  assert.equal(esReintento(
    'arregla el error del formulario de registro que no guarda los datos',
    'arregla el error del formulario de registro que no guarda nada',
  ), true);
});

test('esReintento: prompts distintos no son reintento', () => {
  assert.equal(esReintento('arregla el login', 'añade tests para el servicio de pagos'), false);
});

test('esReintento: prompts muy cortos no comparan por solape', () => {
  assert.equal(esReintento('sí', 'no'), false);
  assert.equal(esReintento('', 'algo'), false);
});

test('veredicto: matriz completa', () => {
  const casos = [
    [{ recModelo: 'sonnet', modeloUsado: 'sonnet', fracaso: false }, 'acierto'],
    [{ recModelo: 'sonnet', modeloUsado: 'sonnet', fracaso: true }, 'corto'],
    [{ recModelo: 'opus', modeloUsado: 'haiku', fracaso: true }, 'bajo_y_fallo'],
    [{ recModelo: 'opus', modeloUsado: 'sonnet', fracaso: false }, 'usuario_bajo'],
    [{ recModelo: 'haiku', modeloUsado: 'opus', fracaso: false }, 'usuario_subio'],
    [{ recModelo: 'haiku', modeloUsado: 'opus', fracaso: true }, 'indeterminado'],
    [{ recModelo: 'sonnet', modeloUsado: null, fracaso: false }, null],
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal(veredicto(entrada), esperado, JSON.stringify(entrada));
  }
});

function turnoCerradoDe({ rec, eventos, nuevoPrompt }) {
  const estado = new SessionState('test');
  estado.aplicar({ kind: 'prompt', texto: rec.promptTexto, ts: new Date().toISOString() });
  estado.turnoRec = rec;
  for (const ev of eventos) estado.aplicar(ev);
  const cerrado = estado.cerrarTurno();
  return cerrado ? construirEtiqueta(cerrado, nuevoPrompt, 'test') : null;
}

test('flujo completo: consejo seguido y turno limpio → acierto', () => {
  const et = turnoCerradoDe({
    rec: { id: 'r1', modelo: 'sonnet', esfuerzo: 'medium', confianza: 0.8, fuente: 'heuristica', l1: { tipoId: 'codificacion' }, promptTexto: 'crea una función de validación' },
    eventos: [{ kind: 'assistant', modelo: 'claude-sonnet-5', usage: null }],
    nuevoPrompt: 'ahora añade tests para esa función',
  });
  assert.equal(et.modeloUsado, 'sonnet');
  assert.equal(et.siguioConsejo, true);
  assert.equal(et.veredicto, 'acierto');
  assert.equal(et.tipoId, 'codificacion');
});

test('flujo completo: usuario cambió a opus con /model → usuario_subio', () => {
  const et = turnoCerradoDe({
    rec: { id: 'r2', modelo: 'sonnet', esfuerzo: 'high', confianza: 0.7, fuente: 'heuristica', l1: { tipoId: 'debugging' }, promptTexto: 'arregla el fallo del websocket' },
    eventos: [{ kind: 'assistant', modelo: 'claude-opus-4-8', usage: null }],
    nuevoPrompt: 'perfecto, ahora documenta el cambio',
  });
  assert.equal(et.siguioConsejo, false);
  assert.equal(et.veredicto, 'usuario_subio');
});

test('flujo completo: errores de herramienta marcan fracaso → corto', () => {
  const et = turnoCerradoDe({
    rec: { id: 'r3', modelo: 'haiku', esfuerzo: null, confianza: 0.8, fuente: 'heuristica', l1: { tipoId: 'comandos' }, promptTexto: 'ejecuta la migración de la base de datos' },
    eventos: [
      { kind: 'assistant', modelo: 'claude-haiku-4-5-20251001', usage: null },
      { kind: 'tool_result', errores: 3, total: 3 },
    ],
    nuevoPrompt: 'prueba otra cosa distinta',
  });
  assert.equal(et.fracaso, true);
  assert.equal(et.veredicto, 'corto');
});

test('sin recomendación en el turno no se genera etiqueta', () => {
  const estado = new SessionState('test');
  estado.aplicar({ kind: 'prompt', texto: 'hola' });
  assert.equal(estado.cerrarTurno(), null);
});

test('un prompt nuevo resetea los contadores del turno', () => {
  const estado = new SessionState('test');
  estado.aplicar({ kind: 'prompt', texto: 'primero' });
  estado.aplicar({ kind: 'assistant', modelo: 'claude-opus-4-8', usage: null });
  estado.aplicar({ kind: 'tool_result', errores: 2, total: 2 });
  estado.aplicar({ kind: 'prompt', texto: 'segundo' });
  assert.equal(estado.modeloTurno, null);
  assert.equal(estado.erroresTurno, 0);
});
