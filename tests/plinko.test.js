const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/services/plinkoService');

test('cada tabla tiene 13 casillas y es simétrica', () => {
  for (const risk of p.RISKS) {
    const m = p.MULTIPLIERS[risk];
    assert.equal(m.length, p.ROWS + 1);
    assert.deepEqual(m, [...m].reverse());
  }
});

test('los premios crecen hacia los bordes (el centro es lo más probable y paga menos)', () => {
  for (const risk of p.RISKS) {
    const left = p.MULTIPLIERS[risk].slice(0, 7);
    for (let i = 1; i < left.length; i++) assert.ok(left[i] <= left[i - 1], `${risk} casilla ${i}`);
  }
});

test('retorno esperado (RTP) de cada riesgo entre 96% y 98%', () => {
  for (const risk of p.RISKS) {
    const rtp = p.expectedReturn(risk);
    assert.ok(rtp > 0.96 && rtp < 0.98, `${risk}: ${rtp}`);
  }
});

test('el camino tiene 12 pasos de 0 o 1 y la casilla es la cantidad de pasos a la derecha', () => {
  const path = p.dropPath();
  assert.equal(path.length, 12);
  assert.ok(path.every((s) => s === 0 || s === 1));
  assert.equal(p.slotOf([1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]), 3);
});

test('todo a la izquierda cae en la casilla 0 y todo a la derecha en la 12 (premio máximo)', () => {
  const left = p.play('high', 100, () => 0);
  assert.equal(left.slot, 0);
  assert.equal(left.winAmount, 25000);
  const right = p.play('high', 100, () => 1);
  assert.equal(right.slot, 12);
  assert.equal(right.multiplier, 250);
});

test('el premio se redondea hacia abajo', () => {
  const r = p.play('low', 15, () => 0); // 15 * 5.6 = 84
  assert.equal(r.winAmount, 84);
  const c = p.play('low', 15, (n) => (n === 2 ? 0 : 0));
  assert.equal(c.winAmount, Math.floor(15 * 5.6));
});

test('simulación: la casilla central cae ~22.6% de las veces (binomial)', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  const N = 100000;
  let center = 0;
  for (let i = 0; i < N; i++) if (p.slotOf(p.dropPath(rnd)) === 6) center++;
  assert.ok(Math.abs(center / N - 0.2256) < 0.01, `centro ${center / N}`);
});
