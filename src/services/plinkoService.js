const { randomInt } = require('../utils/rng');

const ROWS = 12; // 12 filas de clavijas => 13 casillas de premio

// Multiplicador TOTAL por casilla (de izquierda a derecha). Simétricos: el centro es lo más probable y paga menos.
// Retorno esperado (RTP) de cada tabla ≈ 97%; se verifica en tests/plinko.test.js
const half = {
  low: [5.6, 2.1, 1.6, 1.3, 1.0, 1.0, 0.6],
  medium: [18, 7, 2.0, 1.8, 0.9, 0.8, 0.6],
  high: [250, 14, 3, 2, 0.8, 0.5, 0.3],
};
const mirror = (h) => [...h, ...h.slice(0, -1).reverse()];
const MULTIPLIERS = { low: mirror(half.low), medium: mirror(half.medium), high: mirror(half.high) };
const RISKS = Object.keys(MULTIPLIERS);

// Cada fila la bola va a la izquierda (0) o a la derecha (1) con 50% de probabilidad
const dropPath = (rnd = randomInt) => Array.from({ length: ROWS }, () => rnd(2));

const slotOf = (path) => path.reduce((s, step) => s + step, 0);

const multiplierFor = (risk, slot) => MULTIPLIERS[risk][slot];

const choose = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

// RTP exacto = suma de probabilidad(casilla) * multiplicador(casilla)
const expectedReturn = (risk) =>
  MULTIPLIERS[risk].reduce((sum, m, k) => sum + (choose(ROWS, k) / 2 ** ROWS) * m, 0);

const play = (risk, amount, rnd) => {
  const path = dropPath(rnd);
  const slot = slotOf(path);
  const multiplier = multiplierFor(risk, slot);
  return { path, slot, multiplier, winAmount: Math.floor(amount * multiplier) };
};

module.exports = { ROWS, MULTIPLIERS, RISKS, dropPath, slotOf, multiplierFor, expectedReturn, play };
