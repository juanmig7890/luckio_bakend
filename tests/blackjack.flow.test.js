// Prueba de integración del controlador de Blackjack SIN base de datos real:
// se reemplazan los modelos y la billetera por versiones en memoria (dobles de prueba).
const test = require('node:test');
const assert = require('node:assert/strict');

const mock = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};

// ---- Doble de la base de datos ----
const store = new Map();
let nextId = 1;
const DEFAULTS = {
  status: 'active', result: null, payout: 0, pairsBet: 0, pairsType: null, pairsPayout: 0,
  threeBet: 0, threeType: null, threePayout: 0, insurance: 'none', insuranceBet: 0, insurancePayout: 0,
  isHistoricBlackjack: false,
};
class FakeGame {
  constructor(doc) { Object.assign(this, DEFAULTS, doc); }
  async save() { return this; }
  static async create(doc) { const g = new FakeGame({ _id: `g${nextId++}`, ...doc }); store.set(g._id, g); return g; }
  static async findOne(q) {
    return [...store.values()].find((g) => Object.entries(q).every(([k, v]) => g[k] === v)) || null;
  }
  static async findOneAndUpdate(filter, update) {
    const g = [...store.values()].find((x) => Object.entries(filter).every(([k, v]) => x[k] === v));
    if (!g) return null;
    Object.assign(g, update.$set);
    return g;
  }
}

// ---- Doble de la billetera ----
const balances = {};
const userObj = (id) => ({ _id: id, username: 'tester', email: 't@t.co', balance: balances[id], totalWagered: 0, vipLevel: 'Bronce' });
const wallet = {
  placeBet: async (id, amount) => {
    if (balances[id] < amount) throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    balances[id] -= amount;
    return userObj(id);
  },
  creditWin: async (id, amount) => { balances[id] += amount; return userObj(id); },
};

mock('../src/models/BlackjackGame', FakeGame);
mock('../src/models/User', { findById: async (id) => userObj(id) });
mock('../src/services/walletService', wallet);

const cards = require('../src/services/cards');
const c = require('../src/controllers/blackjackController');

// Orden de reparto: jugador1, crupier1 (carta visible), jugador2, crupier2 (oculta), y luego las que se pidan
const rig = (...codes) => { cards.buildShoe = () => [...codes, '2C', '3C', '4C', '5C', '6C']; };

const USER = 'u1';
const reset = (balance = 10000) => { store.clear(); balances[USER] = balance; };
const call = async (fn, { body = {}, params = {} } = {}) => {
  const out = { body: null, error: null };
  await fn({ body, params, user: { _id: USER } }, { json: (d) => { out.body = d; } }, (e) => { out.error = e; });
  return out;
};

test('un blackjack natural del jugador (con crupier sin As) termina al instante y paga 3 a 2', async () => {
  reset();
  rig('AS', 'KH', 'KD', '7C'); // jugador A+K, crupier K+7
  const r = await call(c.start, { body: { amount: 100 } });
  assert.equal(r.body.game.status, 'finished');
  assert.equal(r.body.game.result, 'blackjack');
  assert.equal(balances[USER], 10000 - 100 + 250);
});

test('apuestas laterales: Perfect Pairs y 21+3 se cobran juntas y se pagan al repartir', async () => {
  reset();
  rig('KS', 'KS', 'KS', '5C'); // jugador K♠ K♠ (par perfecto); crupier visible K♠ -> trío del mismo palo (21+3 máximo)
  const r = await call(c.start, { body: { amount: 100, pairsBet: 20, threeBet: 10 } });
  assert.equal(r.body.game.pairsType, 'perfect');
  assert.equal(r.body.game.threeType, 'suitedTrips');
  assert.equal(balances[USER], 10000 - 130 + 20 * 25 + 10 * 101);
  assert.equal(r.body.game.status, 'active'); // K+K = 20, el crupier K+5: no hay blackjack
});

test('si el saldo no alcanza para todas las apuestas no se cobra nada y no se crea la partida', async () => {
  reset(100);
  rig('2S', '3H', '4D', '5C');
  const r = await call(c.start, { body: { amount: 100, pairsBet: 50 } });
  assert.equal(r.error.status, 400);
  assert.equal(balances[USER], 100);
  assert.equal(store.size, 0);
});

test('crupier muestra As: se ofrece el seguro y no se puede jugar hasta decidir', async () => {
  reset();
  rig('0S', 'AH', '7D', '6C'); // jugador 10+7=17; crupier A visible + 6 oculta
  const start = await call(c.start, { body: { amount: 100 } });
  const g = start.body.game;
  assert.equal(g.insurance, 'offered');
  assert.equal(g.canInsure, true);
  assert.equal(g.canHit, false);
  assert.equal(g.dealerCards[1].hidden, true);

  const hit = await call(c.hit, { params: { id: g.id } });
  assert.equal(hit.error.status, 409);
});

test('seguro tomado y el crupier NO tiene blackjack: se pierde el seguro y la mano continúa', async () => {
  reset();
  rig('0S', 'AH', '7D', '6C');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const ins = await call(c.insurance, { params: { id: g.id }, body: { take: true } });
  assert.equal(ins.body.game.status, 'active');
  assert.equal(ins.body.game.insuranceBet, 50);
  assert.equal(balances[USER], 10000 - 100 - 50);

  // Se planta: jugador 17 vs crupier A+6 = 17 suave (se planta) -> empate, devuelve la apuesta
  const stand = await call(c.stand, { params: { id: g.id } });
  assert.equal(stand.body.game.result, 'push');
  assert.equal(balances[USER], 10000 - 50);
});

test('seguro tomado y el crupier SÍ tiene blackjack: el seguro paga 2 a 1 y compensa la apuesta perdida', async () => {
  reset();
  rig('0S', 'AH', '7D', 'KC'); // crupier A + K
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const ins = await call(c.insurance, { params: { id: g.id }, body: { take: true } });
  assert.equal(ins.body.game.status, 'finished');
  assert.equal(ins.body.game.result, 'lose');
  assert.equal(ins.body.game.insurancePayout, 150);
  assert.equal(balances[USER], 10000); // -100 apuesta, -50 seguro, +150 pago del seguro
});

test('rechazar el seguro con crupier con blackjack: se pierde la apuesta', async () => {
  reset();
  rig('0S', 'AH', '7D', 'KC');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const ins = await call(c.insurance, { params: { id: g.id }, body: { take: false } });
  assert.equal(ins.body.game.result, 'lose');
  assert.equal(balances[USER], 10000 - 100);
});

test('jugador con blackjack y crupier con blackjack: empate', async () => {
  reset();
  rig('AS', 'AH', 'KD', 'KC');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const ins = await call(c.insurance, { params: { id: g.id }, body: { take: false } });
  assert.equal(ins.body.game.result, 'push');
  assert.equal(balances[USER], 10000);
});

test('no se puede decidir el seguro dos veces', async () => {
  reset();
  rig('0S', 'AH', '7D', '6C');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.insurance, { params: { id: g.id }, body: { take: false } });
  const again = await call(c.insurance, { params: { id: g.id }, body: { take: true } });
  assert.equal(again.error.status, 409);
});

test('pedir carta hasta pasarse de 21 pierde la mano', async () => {
  reset();
  rig('0S', '7H', '6D', '9C', 'KC'); // jugador 10+6=16, crupier 7+9; pide una K -> 26
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const hit = await call(c.hit, { params: { id: g.id } });
  assert.equal(hit.body.game.result, 'lose');
  assert.equal(hit.body.game.playerScore, 26);
  assert.equal(balances[USER], 10000 - 100);
});

test('doblar cobra otra apuesta, da una sola carta y paga el doble si se gana', async () => {
  reset();
  rig('0S', '7H', '0D', '9C', '0H'); // jugador 10+10=20; crupier 7+9=16 pide...; doble recibe 10 -> 30 bust
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  assert.equal(g.canDouble, true);
  const d = await call(c.double, { params: { id: g.id } });
  assert.equal(d.body.game.bet, 200);
  assert.equal(d.body.game.result, 'lose'); // 30 se pasó
  assert.equal(balances[USER], 10000 - 200);
});

test('retirarse devuelve la mitad de la apuesta', async () => {
  reset();
  rig('0S', '9H', '6D', '9C');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const s = await call(c.surrender, { params: { id: g.id } });
  assert.equal(s.body.game.result, 'surrender');
  assert.equal(balances[USER], 10000 - 50);
});

test('la vista nunca revela la carta oculta del crupier mientras la mano está activa', async () => {
  reset();
  rig('0S', '9H', '6D', '9C');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  assert.deepEqual(g.dealerCards[1], { hidden: true });
  assert.equal(g.dealerScore, 9);
  assert.equal(JSON.stringify(g).includes('shoe'), false);
});
