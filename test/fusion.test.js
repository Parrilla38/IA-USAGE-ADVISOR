import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionar } from '../src/engine/fusion.js';

const l1 = {
  modelo: 'sonnet', esfuerzo: 'medium', confianza: 0.6,
  tipoTarea: 'Codificación cotidiana', tipoId: 'codificacion', complejidad: 'estándar',
  razones: ['tarea detectada: Codificación cotidiana'],
};

test('sin L2 → heurística tal cual', () => {
  const f = fusionar(l1, null);
  assert.equal(f.fuente, 'heuristica');
  assert.equal(f.modelo, 'sonnet');
  assert.equal(f.l2, null);
});

test('L2 con confianza alta prevalece', () => {
  const f = fusionar(l1, { modelo: 'opus', esfuerzo: 'high', confianza: 0.9, reasoning: 'integración compleja' });
  assert.equal(f.fuente, 'ia');
  assert.equal(f.modelo, 'opus');
  assert.equal(f.esfuerzo, 'high');
  assert.ok(f.razones.some((r) => r.includes('integración compleja')));
  assert.ok(f.l1 && f.l2);
});

test('L2 confianza media no cambia el modelo pero queda registrada', () => {
  const f = fusionar(l1, { modelo: 'opus', esfuerzo: 'high', confianza: 0.6, reasoning: 'duda' });
  assert.equal(f.fuente, 'fusion');
  assert.equal(f.modelo, 'sonnet');
  assert.ok(f.l2);
});

test('L2 confianza media coincidente refuerza la confianza', () => {
  const f = fusionar(l1, { modelo: 'sonnet', esfuerzo: 'medium', confianza: 0.6 });
  assert.ok(f.confianza > l1.confianza);
  assert.ok(f.confianza <= 1);
});

test('L2 confianza baja se descarta', () => {
  const f = fusionar(l1, { modelo: 'fable', esfuerzo: 'xhigh', confianza: 0.3 });
  assert.equal(f.fuente, 'heuristica');
  assert.equal(f.modelo, 'sonnet');
});

test('L2 haiku fuerza esfuerzo nulo', () => {
  const f = fusionar(l1, { modelo: 'haiku', esfuerzo: 'low', confianza: 0.85 });
  assert.equal(f.modelo, 'haiku');
  assert.equal(f.esfuerzo, null);
});
