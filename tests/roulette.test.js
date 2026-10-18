const test = require('node:test');
const assert = require('node:assert/strict');
const mockUnused = (rel) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: {} }; };
mockUnused('../src/models/RouletteSpin'); // las funciones puras no usan la base de datos
const r = require('../src/services/rouletteService');

const bet = (betType, selection, amount = 100) => ({ betType, selection, amount });
const one = (b, number, hot = []) => r.settleBets([b], number, hot).results[0];

test('colorOf: 0 es verde, 1 es rojo, 2 es negro', () => {
  assert.equal(r.colorOf(0), 'green');
  assert.equal(r.colorOf(1), 'red');
  assert.equal(r.colorOf(2), 'black');
});

test('pleno acertado paga 35 a 1 (36x total)', () => {
  assert.equal(one(bet('straight', 17), 17).winAmount, 3600);
  assert.equal(one(bet('straight', 17), 18).won, false);
});

test('apuestas simples pagan 1 a 1 y las docenas/columnas 2 a 1', () => {
  assert.equal(one(bet('color', 'red'), 1).winAmount, 200);
  assert.equal(one(bet('parity', 'even'), 2).winAmount, 200);
  assert.equal(one(bet('half', 'high'), 30).winAmount, 200);
  assert.equal(one(bet('dozen', 2), 14).winAmount, 300);
  assert.equal(one(bet('column', 1), 34).winAmount, 300);
});

test('La Partage: con el 0 las apuestas simples recuperan la mitad; pleno, docena y columna no', () => {
  assert.equal(one(bet('color', 'red'), 0).laPartage, 50);
  assert.equal(one(bet('parity', 'odd'), 0).laPartage, 50);
  assert.equal(one(bet('half', 'low'), 0).laPartage, 50);
  assert.equal(one(bet('dozen', 1), 0).laPartage, 0);
  assert.equal(one(bet('straight', 5), 0).laPartage, 0);
});

test('el 0 solo gana si se apostó al 0 directamente', () => {
  assert.equal(one(bet('straight', 0), 0).won, true);
  assert.equal(one(bet('color', 'red'), 0).won, false);
  assert.equal(one(bet('dozen', 1), 0).won, false);
});

test('número caliente: el pleno paga 50% extra, las otras apuestas no', () => {
  const hot = [{ number: 17, hits: 9 }];
  const res = r.settleBets([bet('straight', 17), bet('color', 'black')], 17, hot);
  assert.equal(res.results[0].winAmount, 5400);
  assert.equal(res.results[0].isHot, true);
  assert.equal(res.results[1].winAmount, 200);
  assert.equal(res.totalWin, 5600);
});

test('settleBets suma varias apuestas contra el mismo número (incluye devoluciones de La Partage)', () => {
  const res = r.settleBets([bet('color', 'red', 100), bet('straight', 0, 10), bet('dozen', 1, 50)], 0);
  assert.equal(res.totalWin, 50 + 360); // La Partage + pleno al 0
});

test('normalizeBet acepta apuestas válidas y rechaza las inválidas', () => {
  assert.deepEqual(r.normalizeBet({ betType: 'straight', selection: '7', amount: 10 }), { betType: 'straight', selection: 7, amount: 10 });
  for (const bad of [
    { betType: 'straight', selection: 37, amount: 10 },
    { betType: 'color', selection: 'green', amount: 10 },
    { betType: 'dozen', selection: 4, amount: 10 },
    { betType: 'inventada', selection: 1, amount: 10 },
    { betType: 'color', selection: 'red', amount: 9 },
    { betType: 'color', selection: 'red', amount: 100001 },
    { betType: 'color', selection: 'red', amount: 10.5 },
    null,
  ]) assert.throws(() => r.normalizeBet(bad), { status: 400 });
});

test('simulación: la ruleta es justa (~1/37 por número) con 37 000 giros', () => {
  const counts = new Array(37).fill(0);
  for (let i = 0; i < 37000; i++) counts[r.spinNumber()]++;
  counts.forEach((c) => assert.ok(c > 800 && c < 1200, `un número salió ${c} veces`));
});
