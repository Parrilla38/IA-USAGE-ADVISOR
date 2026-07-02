import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonlTailer } from '../src/watcher/jsonl-tailer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(condicion, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (condicion()) return true;
    await sleep(40);
  }
  return condicion();
}

async function crearEscenario() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'advisor-tailer-'));
  const fichero = path.join(dir, 'sesion.jsonl');
  await fs.writeFile(fichero, '');
  const tailer = new JsonlTailer(fichero, { pollMs: 50 });
  const entradas = [];
  tailer.on('entrada', (e) => entradas.push(e));
  await tailer.start();
  return { fichero, tailer, entradas, limpiar: async () => { await tailer.stop(); await fs.rm(dir, { recursive: true, force: true }); } };
}

test('tailer: línea completa emite entrada', async () => {
  const esc = await crearEscenario();
  try {
    await fs.appendFile(esc.fichero, JSON.stringify({ type: 'user', n: 1 }) + '\n');
    assert.ok(await esperar(() => esc.entradas.length === 1));
    assert.equal(esc.entradas[0].n, 1);
  } finally { await esc.limpiar(); }
});

test('tailer: línea partida en dos escrituras no se pierde ni duplica', async () => {
  const esc = await crearEscenario();
  try {
    const linea = JSON.stringify({ type: 'assistant', n: 2 }) + '\n';
    await fs.appendFile(esc.fichero, linea.slice(0, 10));
    await sleep(200);
    assert.equal(esc.entradas.length, 0); // aún incompleta
    await fs.appendFile(esc.fichero, linea.slice(10));
    assert.ok(await esperar(() => esc.entradas.length === 1));
    assert.equal(esc.entradas[0].n, 2);
  } finally { await esc.limpiar(); }
});

test('tailer: JSON malformado se salta sin romper el stream', async () => {
  const esc = await crearEscenario();
  try {
    await fs.appendFile(esc.fichero, '{esto no es json}\n' + JSON.stringify({ n: 3 }) + '\n');
    assert.ok(await esperar(() => esc.entradas.length === 1));
    assert.equal(esc.entradas[0].n, 3);
    assert.equal(esc.tailer.lineasMalas, 1);
  } finally { await esc.limpiar(); }
});

test('tailer: ráfaga de 50 líneas llega completa y en orden', async () => {
  const esc = await crearEscenario();
  try {
    let contenido = '';
    for (let i = 0; i < 50; i++) contenido += JSON.stringify({ n: i }) + '\n';
    await fs.appendFile(esc.fichero, contenido);
    assert.ok(await esperar(() => esc.entradas.length === 50));
    assert.deepEqual(esc.entradas.map((e) => e.n), [...Array(50).keys()]);
  } finally { await esc.limpiar(); }
});

test('tailer: truncado del fichero reinicia el offset', async () => {
  const esc = await crearEscenario();
  try {
    await fs.appendFile(esc.fichero, JSON.stringify({ n: 'a' }) + '\n' + JSON.stringify({ n: 'b' }) + '\n');
    assert.ok(await esperar(() => esc.entradas.length === 2));
    await fs.writeFile(esc.fichero, JSON.stringify({ n: 'c' }) + '\n'); // reemplazo más corto
    assert.ok(await esperar(() => esc.entradas.length === 3));
    assert.equal(esc.entradas[2].n, 'c');
  } finally { await esc.limpiar(); }
});

test('tailer: arranque en frío sobre fichero grande lee solo la cola', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'advisor-tailer-'));
  const fichero = path.join(dir, 'grande.jsonl');
  let contenido = '';
  for (let i = 0; i < 2000; i++) contenido += JSON.stringify({ n: i, relleno: 'x'.repeat(200) }) + '\n';
  await fs.writeFile(fichero, contenido);
  const tailer = new JsonlTailer(fichero, { pollMs: 50, colaBytes: 4096 });
  const entradas = [];
  tailer.on('entrada', (e) => entradas.push(e));
  try {
    await tailer.start();
    await esperar(() => entradas.length > 0);
    assert.ok(entradas.length > 0 && entradas.length < 100, `leídas ${entradas.length}`);
    assert.equal(entradas.at(-1).n, 1999); // y las últimas son las más recientes
  } finally {
    await tailer.stop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
