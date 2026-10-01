const { weightedPick } = require('../utils/rng');

const JACKPOT_SYMBOL = '🎰';
const SCATTER_MIN = 3; // cuántos 🎰 en cualquier parte de la grilla disparan el jackpot

// w = peso (probabilidad), m = multiplicador por línea si salen 3 iguales (0 = no paga por línea)
const SYMBOLS = [
  { s: '🍒', w: 34, m: 8 },
  { s: '🍋', w: 27, m: 12 },
  { s: '🔔', w: 19, m: 25 },
  { s: '💎', w: 11, m: 60 },
  { s: '7️⃣', w: 6, m: 200 },
  { s: JACKPOT_SYMBOL, w: 3, m: 0 },
];

// 3 filas + 2 diagonales (fila, columna)
const LINES = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[2, 0], [1, 1], [0, 2]],
];

const spin = (amount) => {
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => weightedPick(SYMBOLS).s));
  const lineBet = amount / LINES.length;
  let total = 0;
  const winningCells = new Set();
  const winningLines = [];

  LINES.forEach((line, idx) => {
    const [a, b, c] = line.map(([r, col]) => grid[r][col]);
    if (a === b && b === c) {
      const sym = SYMBOLS.find((x) => x.s === a);
      if (sym.m > 0) {
        total += lineBet * sym.m;
        winningLines.push({ line: idx, symbol: a, multiplier: sym.m });
        line.forEach(([r, col]) => winningCells.add(`${r}-${col}`));
      }
    }
  });

  // Scatter: el símbolo 🎰 gana el jackpot si aparece 3+ veces en cualquier parte de la grilla
  const scatterCount = grid.flat().filter((s) => s === JACKPOT_SYMBOL).length;
  const jackpotWin = scatterCount >= SCATTER_MIN;

  return {
    grid,
    winAmount: Math.floor(total),
    winningLines,
    winningCells: [...winningCells],
    scatterCount,
    jackpotWin,
  };
};

module.exports = { spin, JACKPOT_SYMBOL };
