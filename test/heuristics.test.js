import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recomendar } from '../src/engine/heuristics.js';
import { extraerSenales } from '../src/signals/feature-extractor.js';
import { SessionState } from '../src/signals/session-state.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.default.json', import.meta.url), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/prompts.es.json', import.meta.url), 'utf8'));

function senalesDe(texto, extra = {}) {
  const estado = new SessionState('test');
  return { ...extraerSenales(texto, estado, cfg, 'xhigh'), ...extra };
}

test('rúbrica: exactitud global >= 90% sobre fixtures etiquetados', () => {
  let aciertos = 0;
  const fallos = [];
  for (const f of fixtures) {
    const rec = recomendar(senalesDe(f.texto), cfg);
    if (rec.modelo === f.modelo) aciertos++;
    else fallos.push(`  "${f.texto}" → ${rec.modelo} (esperado ${f.modelo}, tipo ${rec.tipoId})`);
  }
  const exactitud = aciertos / fixtures.length;
  assert.ok(exactitud >= 0.9, `exactitud ${(exactitud * 100).toFixed(1)}% (${aciertos}/${fixtures.length})\n${fallos.join('\n')}`);
});

test('toda recomendación trae razones y confianza válida', () => {
  for (const f of fixtures) {
    const rec = recomendar(senalesDe(f.texto), cfg);
    assert.ok(rec.razones.length >= 1, f.texto);
    assert.ok(rec.confianza > 0 && rec.confianza <= 1, f.texto);
    assert.ok(['haiku', 'sonnet', 'opus', 'fable'].includes(rec.modelo), f.texto);
  }
});

test('modificador: cuota 5h alta baja un nivel de modelo', () => {
  const rec = recomendar(senalesDe('Crea una función que valide correos electrónicos', { cuota5h: 85 }), cfg);
  assert.equal(rec.modelo, 'haiku');
});

test('modificador: cuota crítica baja dos niveles', () => {
  const rec = recomendar(senalesDe('Diseña la arquitectura del nuevo sistema de colas', { cuota5h: 96 }), cfg);
  assert.equal(rec.modelo, 'sonnet');
});

test('modificador: racha de errores de herramientas sube modelo y esfuerzo', () => {
  const sinRacha = recomendar(senalesDe('Arregla el error al guardar el formulario'), cfg);
  const conRacha = recomendar(senalesDe('Arregla el error al guardar el formulario', { rachaErrores: 4 }), cfg);
  assert.equal(sinRacha.modelo, 'sonnet');
  assert.equal(conRacha.modelo, 'opus');
  assert.ok(['high', 'xhigh'].includes(conRacha.esfuerzo));
});

test('modificador: preferencia de latencia rápida capa en Sonnet salvo frontera', () => {
  const refactor = recomendar(senalesDe('Refactoriza el módulo de pagos separando responsabilidades y capas', { preferenciaLatencia: 'rapido' }), cfg);
  assert.equal(refactor.modelo, 'sonnet');
  const arq = recomendar(senalesDe('Diseña la arquitectura del sistema de facturación', { preferenciaLatencia: 'rapido' }), cfg);
  assert.equal(arq.modelo, 'fable'); // frontera no se capa
});

test('modificador: subagentes activos evitan bajar de modelo', () => {
  const rec = recomendar(senalesDe('Formatea este fichero JSON', { subagentes: true, modeloActual: 'opus' }), cfg);
  assert.equal(rec.modelo, 'opus');
});

test('haiku nunca lleva esfuerzo', () => {
  const rec = recomendar(senalesDe('¿Qué es un closure?'), cfg);
  assert.equal(rec.modelo, 'haiku');
  assert.equal(rec.esfuerzo, null);
});

test('mención al repo entero escala la complejidad', () => {
  const rec = recomendar(senalesDe('Añade tests para todo el proyecto, cada servicio con su suite'), cfg);
  assert.ok(['opus', 'fable'].includes(rec.modelo));
});

test('continuación corta hereda el tipo del turno anterior', () => {
  const rec = recomendar(senalesDe('continúa', { tipoPrevio: 'refactor', confPrevia: 0.75 }), cfg);
  assert.equal(rec.modelo, 'opus');
  assert.ok(rec.razones.some((r) => r.includes('continuación')));
});

test('confirmación tipo "sí, hazlo" hereda el tipo del turno anterior', () => {
  const rec = recomendar(senalesDe('sí, hazlo', { tipoPrevio: 'arquitectura', confPrevia: 0.8 }), cfg);
  assert.equal(rec.modelo, 'fable');
});

test('"implementa" tras propuesta de auditoría de seguridad → adopta seguridad (opus/xhigh)', () => {
  const propuesta = 'He revisado el endpoint y veo riesgos. ¿Quieres que haga una auditoría de seguridad completa buscando vulnerabilidades como XSS e inyección SQL?';
  const rec = recomendar(senalesDe('Implementa', { textoAsistente: propuesta }), cfg);
  assert.equal(rec.tipoId, 'seguridad');
  assert.equal(rec.modelo, 'opus');
  assert.equal(rec.esfuerzo, 'xhigh');
  assert.ok(rec.razones.some((r) => r.includes('propuesta previa del asistente')));
});

test('"sí, hazlo" tras propuesta del asistente pesa más que el tipo previo del usuario', () => {
  const propuesta = 'Puedo diseñar la arquitectura del sistema de colas: modelo de datos, trade-offs y plan de migración. ¿Lo hago?';
  const rec = recomendar(senalesDe('sí, hazlo', { textoAsistente: propuesta, tipoPrevio: 'pregunta_rapida', confPrevia: 0.85 }), cfg);
  assert.equal(rec.tipoId, 'arquitectura');
  assert.equal(rec.modelo, 'fable');
});

test('"continúa" prefiere el tipo previo aunque haya texto del asistente', () => {
  const charla = 'He encontrado un error en el módulo y lo estoy arreglando, falla un test.';
  const rec = recomendar(senalesDe('continúa', { textoAsistente: charla, tipoPrevio: 'refactor', confPrevia: 0.75 }), cfg);
  assert.equal(rec.tipoId, 'refactor');
  assert.equal(rec.modelo, 'opus');
});

test('"continúa" sin tipo previo usa la propuesta del asistente como respaldo', () => {
  const propuesta = '¿Quieres que refactorice el módulo de pagos separando la lógica en capas?';
  const rec = recomendar(senalesDe('continúa', { textoAsistente: propuesta }), cfg);
  assert.equal(rec.tipoId, 'refactor');
});

test('"implementa" sin ningún contexto no rompe', () => {
  const rec = recomendar(senalesDe('Implementa'), cfg);
  assert.ok(['haiku', 'sonnet'].includes(rec.modelo));
});

test('sin turno previo, "continúa" no rompe (cae al fallback)', () => {
  const rec = recomendar(senalesDe('continúa'), cfg);
  assert.equal(rec.modelo, 'haiku');
});

test('dos prompts de debugging seguidos escalan la capacidad', () => {
  const solo = recomendar(senalesDe('Arregla el error al guardar el formulario'), cfg);
  const repetido = recomendar(senalesDe('Arregla el error al guardar el formulario', { tipoPrevio: 'debugging' }), cfg);
  assert.equal(solo.modelo, 'sonnet');
  assert.equal(repetido.modelo, 'opus');
});

test('rendimiento con objeto concreto → sonnet', () => {
  const rec = recomendar(senalesDe('La página tarda 8 segundos en cargar, optimízala'), cfg);
  assert.equal(rec.modelo, 'sonnet');
  assert.equal(rec.tipoId, 'rendimiento');
});

test('seguridad → opus/xhigh', () => {
  const rec = recomendar(senalesDe('Audita la seguridad del endpoint de subida de ficheros'), cfg);
  assert.equal(rec.modelo, 'opus');
  assert.equal(rec.esfuerzo, 'xhigh');
});

test('señales mixtas entre modelos distintos reducen la confianza', () => {
  const limpio = recomendar(senalesDe('¿Qué es un closure en JavaScript?'), cfg);
  const mixto = recomendar(senalesDe('Explica el error'), cfg);
  assert.ok(mixto.confianza < limpio.confianza);
  assert.ok(mixto.razones.some((r) => r.includes('mixtas')));
});

test('varias señales léxicas del mismo tipo suben la confianza', () => {
  const rec = recomendar(senalesDe('Diseña la arquitectura de un sistema de colas de trabajos con reintentos y prioridades'), cfg);
  assert.ok(rec.confianza >= 0.8);
  assert.ok(rec.razones.some((r) => r.includes('coinciden')));
});
