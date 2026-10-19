const { LiveTable, httpError } = require('./liveTable');
const cards = require('../services/cards');
const rules = require('../services/baccaratRules');

const SPOTS = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];
const MIN_BET = 10;

// Mesa de Bacará compartida: una sola mano de Punto y Banca por ronda, apuestas individuales.
class BaccaratTable extends LiveTable {
  constructor(opts) {
    super({ id: 'baccarat', game: 'baccarat', ...opts });
    this.deps = {
      buildShoe: () => cards.buildShoe(8),
      recordRound: (doc) => require('../models/BaccaratRound').create(doc),
      ...(opts.deps || {}),
    };
  }

  normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError(400, 'Debes enviar tus apuestas');
    const out = {};
    for (const k of SPOTS) {
      const v = Number(raw[k] ?? 0);
      if (!Number.isInteger(v) || v < 0) throw httpError(400, 'Cada apuesta debe ser un entero positivo');
      if (v > 0 && v < MIN_BET) throw httpError(400, 'La apuesta mínima por casilla es 10');
      out[k] = v;
    }
    if (SPOTS.every((k) => out[k] === 0)) throw httpError(400, 'Apuesta en al menos una casilla');
    return out;
  }

  merge(current, incoming) {
    const out = {};
    for (const k of SPOTS) out[k] = (current?.[k] || 0) + incoming[k];
    // No se permite tener Punto y Banca a la vez, ni sumando lo que ya tenías con lo nuevo que llega
    if (rules.conflictsPlayerBanker(out)) throw httpError(400, 'No puedes apostar a Punto y a Banca en la misma mano');
    return out;
  }

  totalOf(items) {
    return SPOTS.reduce((s, k) => s + (items[k] || 0), 0);
  }

  historyEntry(r) {
    return { winner: r.winner, playerPair: r.playerPair, bankerPair: r.bankerPair, playerTotal: r.playerTotal, bankerTotal: r.bankerTotal };
  }

  async draw(entries) {
    const shoe = this.deps.buildShoe();
    const round = rules.dealRound(() => cards.draw(shoe, 1)[0]);

    const settlements = new Map();
    for (const [userId, entry] of entries) {
      const payouts = rules.settle(entry.items, round);
      const totalWin = SPOTS.reduce((s, k) => s + payouts[k], 0);
      try {
        await this.deps.recordRound({ user: userId, bets: entry.items, ...round, totalBet: entry.total, totalWin });
      } catch (err) {
        this.emit('error', err);
      }
      settlements.set(userId, {
        totalBet: entry.total,
        totalWin,
        meta: { winner: round.winner, payouts },
        detail: { bets: entry.items, payouts },
      });
    }
    return { result: round, settlements };
  }
}

module.exports = BaccaratTable;
