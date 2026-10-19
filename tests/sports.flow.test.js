// Prueba de integración del controlador de apuestas deportivas SIN base de datos real ni internet:
// se reemplazan los modelos, la billetera y The Odds API por dobles de prueba.
const test = require('node:test');
const assert = require('node:assert/strict');

const mock = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};

// ---- Doble de una colección Mongoose (solo lo que de verdad usa el controlador) ----
const makeCollection = () => {
  let seq = 1;
  const docs = new Map();
  const queryable = (list) => {
    let result = [...list];
    const api = {
      sort(spec) {
        const [[field, dir]] = Object.entries(spec);
        result = [...result].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * dir);
        return api;
      },
      limit(n) {
        result = result.slice(0, n);
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return api;
  };
  const withSave = (d) => {
    if (!Object.getOwnPropertyDescriptor(d, 'save')) Object.defineProperty(d, 'save', { value: async () => d, enumerable: false });
    return d;
  };
  return {
    docs,
    async create(doc) {
      const d = withSave({ _id: `id${seq++}`, status: 'pending', createdAt: new Date(seq), ...doc });
      docs.set(d._id, d);
      return d;
    },
    find(q = {}) {
      const list = [...docs.values()].filter((d) => {
        if (q.user !== undefined && String(d.user) !== String(q.user)) return false;
        if (q.status !== undefined && d.status !== q.status) return false;
        if (q.commenceTime?.$lt && !(new Date(d.commenceTime) < q.commenceTime.$lt)) return false;
        if (q['legs.commenceTime']?.$lt) {
          const lt = q['legs.commenceTime'].$lt;
          if (!(d.legs || []).some((l) => new Date(l.commenceTime) < lt)) return false;
        }
        return true;
      });
      return queryable(list);
    },
    async findOneAndUpdate(filter, update) {
      const d = [...docs.values()].find((x) => x._id === filter._id && (filter.status === undefined || x.status === filter.status));
      if (!d) return null;
      Object.assign(d, update);
      return d;
    },
  };
};

const SportsBet = makeCollection();
const ParlayBet = makeCollection();

// ---- Doble de la billetera ----
const balances = { u1: 1000 };
const txLog = [];
const userObj = (id) => ({ _id: id, username: 'tester', email: 't@t.co', balance: balances[id], totalWagered: 0, vipLevel: 'Bronce' });
const wallet = {
  placeBet: async (id, amount) => {
    if (balances[id] < amount) throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    balances[id] -= amount;
    txLog.push(['bet', id, amount]);
    return userObj(id);
  },
  creditWin: async (id, amount) => {
    if (amount <= 0) return userObj(id);
    balances[id] += amount;
    txLog.push(['win', id, amount]);
    return userObj(id);
  },
};

// ---- Doble de The Odds API ----
const future = (mins) => new Date(Date.now() + mins * 60000).toISOString();
let EVENTS = [];
let SCORES = {};
const odds = {
  getEvents: async () => EVENTS,
  getScores: async (sportKey) => Object.values(SCORES).filter((s) => s.sportKey === sportKey),
};

mock('../src/models/SportsBet', SportsBet);
mock('../src/models/ParlayBet', ParlayBet);
mock('../src/models/User', { findById: async (id) => userObj(id) });
mock('../src/services/walletService', wallet);
mock('../src/services/oddsService', odds);

const c = require('../src/controllers/sportsController');
const USER = 'u1';

const call = async (fn, body = {}) => {
  const out = { body: null, status: 200, error: null };
  await fn({ body, user: { _id: USER } }, { status: (s) => { out.status = s; return { json: (d) => { out.body = d; } }; }, json: (d) => { out.body = d; } }, (e) => { out.error = e; });
  return out;
};

test.beforeEach(() => {
  balances.u1 = 1000;
  txLog.length = 0;
  SportsBet.docs.clear();
  ParlayBet.docs.clear();
  SCORES = {};
  EVENTS = [
    {
      id: 'ev1', sportKey: 'soccer_epl', sportTitle: 'EPL', commenceTime: future(60),
      homeTeam: 'Arsenal', awayTeam: 'Chelsea',
      odds: [{ name: 'Arsenal', price: 2.1 }, { name: 'Chelsea', price: 3.4 }, { name: 'Draw', price: 3.2 }],
      totals: [{ name: 'Over', point: 2.5, price: 1.9 }, { name: 'Under', point: 2.5, price: 1.95 }],
    },
    {
      id: 'ev2', sportKey: 'soccer_spain_la_liga', sportTitle: 'La Liga', commenceTime: future(90),
      homeTeam: 'Sevilla', awayTeam: 'Betis',
      odds: [{ name: 'Sevilla', price: 1.8 }, { name: 'Betis', price: 4.5 }, { name: 'Draw', price: 3.6 }],
      totals: [{ name: 'Over', point: 2.5, price: 2.0 }, { name: 'Under', point: 2.5, price: 1.8 }],
    },
  ];
});

test('apuesta sencilla: cobra la cuota real del servidor (no la del cliente) y rechaza selección inválida', async () => {
  const r = await call(c.placeBet, { eventId: 'ev1', pick: 'Arsenal', amount: 100 });
  assert.equal(r.body.bet.odds, 2.1);
  assert.equal(r.body.bet.potentialWin, 210);
  assert.equal(balances.u1, 900);

  const bad = await call(c.placeBet, { eventId: 'ev1', pick: 'Juventus', amount: 50 });
  assert.equal(bad.error?.status, 400);
  assert.equal(balances.u1, 900); // no se cobró nada por el intento inválido
});

test('apuesta sencilla al total de goles (Over/Under)', async () => {
  const r = await call(c.placeBet, { eventId: 'ev1', market: 'totals', pick: 'Over', point: 2.5, amount: 100 });
  assert.equal(r.body.bet.market, 'totals');
  assert.equal(r.body.bet.odds, 1.9);
  assert.equal(r.body.bet.potentialWin, 190);
});

test('combinada: multiplica las cuotas reales de cada pata y cobra una sola vez', async () => {
  const r = await call(c.placeParlay, {
    amount: 100,
    legs: [
      { eventId: 'ev1', pick: 'Arsenal' },
      { eventId: 'ev2', pick: 'Sevilla' },
    ],
  });
  assert.equal(r.body.bet.combinedOdds, Math.round(2.1 * 1.8 * 100) / 100); // 3.78
  assert.equal(r.body.bet.potentialWin, Math.floor(100 * 3.78));
  assert.equal(balances.u1, 900);
});

test('combinada: rechaza menos de 2 patas, más del máximo, o repetir el mismo partido', async () => {
  const unaSola = await call(c.placeParlay, { amount: 100, legs: [{ eventId: 'ev1', pick: 'Arsenal' }] });
  assert.equal(unaSola.error?.status, 400);

  const repetido = await call(c.placeParlay, {
    amount: 100,
    legs: [{ eventId: 'ev1', pick: 'Arsenal' }, { eventId: 'ev1', pick: 'Chelsea' }],
  });
  assert.equal(repetido.error?.status, 400);
  assert.equal(balances.u1, 1000); // ninguno de los dos intentos cobró nada
});

test('liquidar: una sencilla ganadora paga el premio; una perdedora no paga nada', async () => {
  await call(c.placeBet, { eventId: 'ev1', pick: 'Arsenal', amount: 100 }); // ganará
  await call(c.placeBet, { eventId: 'ev2', pick: 'Betis', amount: 50 }); // perderá
  SportsBet.docs.forEach((d) => { d.commenceTime = new Date(Date.now() - 1000); }); // ya "empezaron"
  SCORES = {
    ev1: { id: 'ev1', sportKey: 'soccer_epl', home_team: 'Arsenal', away_team: 'Chelsea', completed: true, scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }] },
    ev2: { id: 'ev2', sportKey: 'soccer_spain_la_liga', home_team: 'Sevilla', away_team: 'Betis', completed: true, scores: [{ name: 'Sevilla', score: '2' }, { name: 'Betis', score: '0' }] },
  };

  const r = await call(c.settle);
  assert.equal(r.body.settled, 2);
  assert.equal(balances.u1, 1000 - 150 + 210); // -100 -50 (apuestas) + 210 (premio de la ganadora)
});

test('liquidar: una combinada con una pata que pierde no paga nada; si todas ganan, paga la cuota combinada', async () => {
  await call(c.placeParlay, { amount: 100, legs: [{ eventId: 'ev1', pick: 'Arsenal' }, { eventId: 'ev2', pick: 'Betis' }] }); // Betis pierde
  ParlayBet.docs.forEach((d) => d.legs.forEach((l) => { l.commenceTime = new Date(Date.now() - 1000); }));
  SCORES = {
    ev1: { id: 'ev1', sportKey: 'soccer_epl', home_team: 'Arsenal', away_team: 'Chelsea', completed: true, scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }] },
    ev2: { id: 'ev2', sportKey: 'soccer_spain_la_liga', home_team: 'Sevilla', away_team: 'Betis', completed: true, scores: [{ name: 'Sevilla', score: '2' }, { name: 'Betis', score: '0' }] },
  };

  await call(c.settle);
  assert.equal(balances.u1, 900); // -100 de la apuesta, 0 de premio (perdió la combinada)
  const parlay = [...ParlayBet.docs.values()][0];
  assert.equal(parlay.status, 'lost');
  assert.equal(parlay.legs[0].status, 'won');
  assert.equal(parlay.legs[1].status, 'lost');
});

test('liquidar: una pata que empuja (push) se cobra a cuota 1, no anula la combinada', async () => {
  EVENTS[1].totals = [{ name: 'Over', point: 2, price: 2.0 }, { name: 'Under', point: 2, price: 1.8 }]; // línea entera a propósito, para poder empujar
  await call(c.placeParlay, {
    amount: 100,
    legs: [{ eventId: 'ev1', pick: 'Arsenal' }, { eventId: 'ev2', market: 'totals', pick: 'Over', point: 2 }],
  });
  const parlayBefore = [...ParlayBet.docs.values()][0];
  const combinedOdds = parlayBefore.combinedOdds; // 2.1 * 2.0
  parlayBefore.legs.forEach((l) => { l.commenceTime = new Date(Date.now() - 1000); });
  SCORES = {
    ev1: { id: 'ev1', sportKey: 'soccer_epl', home_team: 'Arsenal', away_team: 'Chelsea', completed: true, scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }] },
    ev2: { id: 'ev2', sportKey: 'soccer_spain_la_liga', home_team: 'Sevilla', away_team: 'Betis', completed: true, scores: [{ name: 'Sevilla', score: '1' }, { name: 'Betis', score: '1' }] }, // total 2 = la línea exacta
  };

  await call(c.settle);
  const parlay = [...ParlayBet.docs.values()][0];
  assert.equal(parlay.status, 'won');
  assert.equal(parlay.legs[1].status, 'push');
  // La pata empujada se cobra a cuota 1 (se divide la cuota combinada por su propia cuota): 2.1 * 2.0 / 2.0 = 2.1
  const esperado = Math.floor(100 * combinedOdds * (1 / parlay.legs[1].odds));
  assert.equal(balances.u1, 1000 - 100 + esperado);
});
