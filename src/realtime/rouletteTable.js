const { LiveTable, httpError } = require('./liveTable');
const roulette = require('../services/rouletteService');

const MAX_DISTINCT = 20; // apuestas distintas por jugador y ronda (igual que la mesa individual)
const keyOf = (b) => `${b.betType}:${b.selection}`;

// Ruleta europea compartida: todos ven el mismo número y cada uno cobra según sus propias apuestas.
class RouletteTable extends LiveTable {
  constructor(opts) {
    super({ id: 'roulette', game: 'roulette', ...opts });
    this.deps = {
      spinNumber: roulette.spinNumber,
      recordSpin: (doc) => require('../models/RouletteSpin').create(doc),
      getHotNumbers: roulette.getHotNumbers,
      ...(opts.deps || {}),
    };
  }

  normalize(raw) {
    if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, 'Debes enviar al menos una apuesta');
    if (raw.length > MAX_DISTINCT) throw httpError(400, `Máximo ${MAX_DISTINCT} apuestas distintas por ronda`);
    return raw.map(roulette.normalizeBet);
  }

  // Une las apuestas nuevas con las que el jugador ya tenía (misma casilla = se suman las fichas)
  merge(current, incoming) {
    const map = new Map((current || []).map((b) => [keyOf(b), { ...b }]));
    for (const b of incoming) {
      const k = keyOf(b);
      if (map.has(k)) map.get(k).amount += b.amount;
      else map.set(k, { ...b });
    }
    if (map.size > MAX_DISTINCT) throw httpError(400, `Máximo ${MAX_DISTINCT} apuestas distintas por ronda`);
    return [...map.values()];
  }

  totalOf(items) {
    return items.reduce((s, b) => s + b.amount, 0);
  }

  historyEntry(result) {
    return { number: result.number, color: result.color };
  }

  async draw(entries) {
    const number = this.deps.spinNumber();
    const color = roulette.colorOf(number);
    await this.deps.recordSpin({ number, color });
    const hotNumbers = await this.deps.getHotNumbers();

    const settlements = new Map();
    for (const [userId, entry] of entries) {
      const { results, totalWin } = roulette.settleBets(entry.items, number, hotNumbers);
      settlements.set(userId, {
        totalBet: entry.total,
        totalWin,
        meta: { number, color },
        detail: { number, color, results, hotNumbers },
      });
    }
    return { result: { number, color, hotNumbers }, settlements };
  }
}

module.exports = RouletteTable;
