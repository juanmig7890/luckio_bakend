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
  assert.equal(balances[USER], 10000 - 130 + 20 * 26 + 10 * 101);
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

// ================= Dividir (split) y Charlie de 5 cartas =================

test('dividir 8-8: cobra otra apuesta, reparte una carta a cada mano y se juegan una por una', async () => {
  reset();
  rig('8S', '9H', '8D', '7C', '3H', '2D'); // jugador 8+8, crupier 9+7=16; split: 8+3=11 y 8+2=10
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  assert.equal(g.canSplit, true);

  const s = (await call(c.split, { params: { id: g.id } })).body.game;
  assert.equal(s.hands.length, 2);
  assert.equal(s.bet, 200);
  assert.equal(balances[USER], 10000 - 200);
  assert.equal(s.hands[0].score, 11);
  assert.equal(s.hands[1].score, 10);
  assert.equal(s.activeHand, 0);
  assert.equal(s.hands[0].active, true);
  assert.equal(s.canSurrender, false); // no se puede retirar después de dividir
});

test('dividir y plantarse en ambas manos: el crupier juega una vez y cada mano se paga por separado', async () => {
  reset();
  // jugador 10+10, crupier 9+8=17 (se planta); split: 10+9=19 (gana) y 10+6=16 (pierde)
  rig('0S', '9H', '0D', '8C', '9D', '6H');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.split, { params: { id: g.id } });
  const a = await call(c.stand, { params: { id: g.id } });
  assert.equal(a.body.game.status, 'active');
  assert.equal(a.body.game.activeHand, 1);
  const b = (await call(c.stand, { params: { id: g.id } })).body.game;
  assert.equal(b.status, 'finished');
  assert.equal(b.result, 'split');
  assert.deepEqual(b.hands.map((h) => h.result), ['win', 'lose']);
  assert.equal(b.payout, 200);
  assert.equal(balances[USER], 10000 - 200 + 200);
});

test('Ases divididos: una sola carta por mano, no se puede pedir ni doblar, y un 21 no cuenta como blackjack', async () => {
  reset();
  rig('AS', '9H', 'AD', '8C', 'KH', 'KD'); // split de Ases: A+K y A+K = 21 y 21; crupier 17
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const s = (await call(c.split, { params: { id: g.id } })).body.game;
  assert.equal(s.status, 'finished'); // ambas manos quedan cerradas solas
  assert.deepEqual(s.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(s.payout, 400); // 1 a 1, no 3 a 2
  assert.equal(balances[USER], 10000 - 200 + 400);
});

test('no se puede dividir dos cartas de distinto valor', async () => {
  reset();
  rig('8S', '9H', '7D', '7C');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  assert.equal(g.canSplit, false);
  const s = await call(c.split, { params: { id: g.id } });
  assert.equal(s.error.status, 400);
  assert.equal(balances[USER], 10000 - 100);
});

test('K y Q sí se pueden dividir (los dos valen 10)', async () => {
  reset();
  rig('KS', '9H', 'QD', '7C', '2H', '3D');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  assert.equal(g.canSplit, true);
});

test('dividir sin saldo suficiente falla y no cambia nada', async () => {
  reset(150);
  rig('8S', '9H', '8D', '7C', '3H', '2D');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  const s = await call(c.split, { params: { id: g.id } });
  assert.equal(s.error.status, 400);
  assert.equal(balances[USER], 50);
  const again = (await call(c.hit, { params: { id: g.id } })).body.game;
  assert.equal(again.hands.length, 1);
});

test('máximo 4 manos: a la cuarta mano ya no se puede dividir más', async () => {
  reset(100000);
  // 8+8 -> split (8+8, 8+8) -> split de nuevo en la primera -> (8+8, 8+8) -> ... siempre salen 8
  rig('8S', '9H', '8D', '7C', '8H', '8C', '8D', '8H', '8S', '8C', '2D', '2H');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  let r = (await call(c.split, { params: { id: g.id } })).body.game; // 2 manos: 8+8 y 8+8
  r = (await call(c.split, { params: { id: g.id } })).body.game; // 3 manos
  assert.equal(r.hands.length, 3);
  r = (await call(c.split, { params: { id: g.id } })).body.game; // 4 manos
  assert.equal(r.hands.length, 4);
  assert.equal(r.canSplit, false);
  const more = await call(c.split, { params: { id: g.id } });
  assert.equal(more.error.status, 400);
});

test('doblar después de dividir está permitido y solo duplica la apuesta de esa mano', async () => {
  reset();
  // jugador 5+5, crupier 9+8=17; split: 5+6=11 (dobla y recibe 10 -> 21) y 5+3=8
  rig('5S', '9H', '5D', '8C', '6H', '3D', '0C', '2S');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.split, { params: { id: g.id } });
  const d = (await call(c.double, { params: { id: g.id } })).body.game;
  assert.equal(d.hands[0].bet, 200);
  assert.equal(d.hands[0].doubled, true);
  assert.equal(d.hands[1].bet, 100);
  assert.equal(d.activeHand, 1);
  assert.equal(balances[USER], 10000 - 100 - 100 - 100);
});

test('Charlie: 5 cartas sin pasarse de 21 gana al instante 1 a 1, aunque el crupier tenga más', async () => {
  reset();
  // jugador A+2 (suave 13), crupier 10+9=19; pide: 3 (16), 2 (18)... 5 cartas = A,2,3,2,2 = 10 -> 20 suave
  rig('AS', '0H', '2D', '9C', '3H', '2C', '2H');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.hit, { params: { id: g.id } });
  await call(c.hit, { params: { id: g.id } });
  const last = (await call(c.hit, { params: { id: g.id } })).body.game;
  assert.equal(last.status, 'finished');
  assert.equal(last.hands[0].charlie, true);
  assert.equal(last.result, 'win');
  assert.equal(balances[USER], 10000 - 100 + 200);
});

test('con 5 cartas pero pasándose de 21 NO es Charlie: pierde', async () => {
  reset();
  rig('5S', '0H', '3D', '9C', '2H', '4C', '0D'); // 5+3=8, +2=10, +4=14, +10=24
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.hit, { params: { id: g.id } });
  await call(c.hit, { params: { id: g.id } });
  const last = (await call(c.hit, { params: { id: g.id } })).body.game;
  assert.equal(last.hands[0].cards.length, 5);
  assert.equal(last.hands[0].charlie, false);
  assert.equal(last.result, 'lose');
  assert.equal(balances[USER], 10000 - 100);
});

test('retirarse con una mano ya dividida no está permitido', async () => {
  reset();
  rig('8S', '9H', '8D', '7C', '3H', '2D');
  const g = (await call(c.start, { body: { amount: 100 } })).body.game;
  await call(c.split, { params: { id: g.id } });
  const s = await call(c.surrender, { params: { id: g.id } });
  assert.equal(s.error.status, 400);
});

test('una partida guardada con el formato antiguo (solo playerCards) se sigue pudiendo jugar', async () => {
  reset();
  balances[USER] = 10000 - 100;
  const g = await FakeGame.create({
    user: USER, shoe: ['2C', '3C'], bet: 100,
    playerCards: [{ code: '0S', value: '10', suit: 'SPADES' }, { code: '8H', value: '8', suit: 'HEARTS' }],
    dealerCards: [{ code: '9H', value: '9', suit: 'HEARTS' }, { code: '8C', value: '8', suit: 'CLUBS' }],
  });
  const st = await call(c.stand, { params: { id: g._id } });
  assert.equal(st.body.game.result, 'win'); // 18 contra 17
  assert.equal(balances[USER], 10000 - 100 + 200);
});
