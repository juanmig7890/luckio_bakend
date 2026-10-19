// Prueba de integración REAL con Socket.IO para el blackjack en vivo: dos clientes, cada uno en su silla,
// jugando manos independientes con el mismo crupier. La base de datos y la billetera son dobles de prueba;
// el servidor, el cliente y la red local sí son reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { attachRealtime } = require('../src/realtime');
const { BlackjackTable } = require('../src/realtime/blackjackTable');
const RouletteTable = require('../src/realtime/rouletteTable');
const BaccaratTable = require('../src/realtime/baccaratTable');

const balances = { u1: 1000, u2: 1000 };
const wallet = {
  placeBet: async (id, amount) => {
    if (balances[id] < amount) throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    balances[id] -= amount;
    return { _id: id, username: id, balance: balances[id] };
  },
  creditWin: async (id, amount) => { balances[id] += amount; return { _id: id, balance: balances[id] }; },
};

const USERS = { t1: { _id: 'u1', username: 'ana' }, t2: { _id: 'u2', username: 'beto' } };
const shared = {
  wallet,
  getUser: async (id) => ({ _id: id, username: id, email: `${id}@x.co`, balance: balances[id], totalWagered: 0, vipLevel: 'Bronce' }),
  publicUser: (u) => ({ id: u._id, username: u.username, balance: u.balance }),
  durations: { betMs: 400, insuranceMs: 300, turnMs: 400, dealerMs: 100, resultMs: 300 },
};
const tables = {
  roulette: new RouletteTable({ ...shared, deps: { spinNumber: () => 17, recordSpin: async () => {}, getHotNumbers: async () => [] } }),
  baccarat: new BaccaratTable({ ...shared }),
  // Reparto fijo: u1 (silla0) 9H+6H=15, u2 (silla1) 0D+8C=18; crupier 9D+8D=17 (se planta, nadie pide)
  blackjack: new BlackjackTable({ ...shared, deps: { buildShoe: () => ['9H', '0D', '9D', '6H', '8C', '8D'] } }),
};

let server; let port;
const clients = [];
test.before(async () => {
  server = http.createServer();
  attachRealtime(server, {
    tables,
    origins: '*',
    authenticate: async (token) => { if (!USERS[token]) throw new Error('mal'); return USERS[token]; },
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(async () => {
  clients.forEach((c) => c.close());
  tables.roulette.stop();
  tables.baccarat.stop();
  tables.blackjack.stop();
  await new Promise((r) => server.close(r));
});

const client = async (token) => {
  const c = connect(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
  clients.push(c);
  await new Promise((res, rej) => { c.on('connect', res); c.on('connect_error', rej); });
  return c;
};
const emit = (c, ev, payload) => new Promise((r) => c.emit(ev, payload, r));
const next = (c, ev) => new Promise((r) => c.once(ev, r));
const untilState = (c, predicate) => new Promise((resolve) => {
  const on = (snap) => { if (predicate(snap)) { c.off('bj:state', on); resolve(snap); } };
  c.on('bj:state', on);
});

test('dos jugadores sentados en sillas distintas del blackjack en vivo juegan manos independientes', async () => {
  const a = await client('t1');
  const b = await client('t2');

  const joinA = await emit(a, 'bj:join');
  assert.equal(joinA.ok, true);
  await emit(b, 'bj:join');

  const sitA = await emit(a, 'bj:sit', { seat: 0 });
  assert.equal(sitA.ok, true);
  assert.equal(sitA.state.seats[0].userId, 'u1');
  const sitB = await emit(b, 'bj:sit', { seat: 1 });
  assert.equal(sitB.ok, true);

  const outA = next(a, 'bj:outcome');
  const outB = next(b, 'bj:outcome');
  const playingA = untilState(a, (s) => s.phase === 'playing');

  const betA = await emit(a, 'bj:bet', { seat: 0, amount: 100 });
  assert.equal(betA.ok, true);
  assert.equal(betA.user.balance, 900);
  const betB = await emit(b, 'bj:bet', { seat: 1, amount: 100 });
  assert.equal(betB.ok, true);

  await playingA; // ya se repartió: silla0 (u1) tiene 15, silla1 (u2) tiene 18, crupier muestra 17
  const standA = await emit(a, 'bj:action', { seat: 0, type: 'stand' });
  assert.equal(standA.ok, true);
  const standB = await emit(b, 'bj:action', { seat: 1, type: 'stand' });
  assert.equal(standB.ok, true);

  const [oA, oB] = await Promise.all([outA, outB]);
  assert.equal(oA.hands[0].result, 'lose'); // 15 vs 17
  assert.equal(oA.totalWin, 0);
  assert.equal(oB.hands[0].result, 'win'); // 18 vs 17
  assert.equal(oB.totalWin, 200);
  assert.equal(oA.user.balance, 900);
  assert.equal(oB.user.balance, 1100);
});

test('no se puede apostar sin estar sentado, ni actuar en la silla de otro jugador', async () => {
  const a = await client('t1'); // u1, que en la prueba anterior quedó sentado en la silla 0
  const noSentado = await emit(a, 'bj:bet', { seat: 5, amount: 50 });
  assert.equal(noSentado.ok, false);
  assert.equal(noSentado.status, 403);

  const ajena = await emit(a, 'bj:action', { seat: 1, type: 'stand' }); // la silla 1 es de u2, no de u1
  assert.equal(ajena.ok, false);
});
