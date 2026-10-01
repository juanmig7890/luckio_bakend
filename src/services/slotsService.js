const { weightedPick } = require('../utils/rng');

// w = peso (probabilidad), m = multiplicador por línea si salen 3 iguales
const SYMBOLS = [
  { s: '🍒', w: 35, m: 8 },
  { s: '🍋', w: 28, m: 12 },
  { s: '🔔', w: 20, m: 25 },
  { s: '💎', w: 11, m: 60 },
  { s: '7️⃣', w: 6, m: 200 },
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
      total += lineBet * sym.m;
      winningLines.push({ line: idx, symbol: a, multiplier: sym.m });
      line.forEach(([r, col]) => winningCells.add(`${r}-${col}`));
    }
  });

  return { grid, winAmount: Math.floor(total), winningLines, winningCells: [...winningCells] };
};

module.exports = { spin };