// Prueba de integración REAL con Socket.IO: dos clientes conectados a la misma mesa en vivo.
// La base de datos y la billetera son dobles de prueba; el servidor, el cliente y la red local sí son reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { attachRealtime, buildTables } = require('../src/realtime');

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
const tables = buildTables({
  wallet,
  getUser: async (id) => ({ _id: id, username: id, email: `${id}@x.co`, balance: balances[id], totalWagered: 0, vipLevel: 'Bronce' }),
  publicUser: (u) => ({ id: u._id, username: u.username, balance: u.balance }),
  durations: { betMs: 400, resolveMs: 200, resultMs: 200 },
  roulette: { spinNumber: () => 17, recordSpin: async () => {}, getHotNumbers: async () => [] },
});

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

test('un token inválido no puede conectarse', async () => {
  await assert.rejects(client('falso'), /No autorizado/);
});

test('dos jugadores en la misma ruleta ven el mismo número y cada uno recibe SU resultado', async () => {
  const a = await client('t1');
  const b = await client('t2');
  const joinA = await emit(a, 'table:join', { table: 'roulette' });
  assert.equal(joinA.ok, true);
  assert.equal(joinA.state.phase, 'betting');
  await emit(b, 'table:join', { table: 'roulette' });

  const resA = next(a, 'table:resolving');
  const resB = next(b, 'table:resolving');
  const outA = next(a, 'table:outcome');
  const outB = next(b, 'table:outcome');

  const betA = await emit(a, 'table:bet', { table: 'roulette', bets: [{ betType: 'straight', selection: 17, amount: 10 }] });
  const betB = await emit(b, 'table:bet', { table: 'roulette', bets: [{ betType: 'color', selection: 'red', amount: 100 }] });
  assert.equal(betA.ok, true);
  assert.equal(betA.user.balance, 990);
  assert.equal(betB.ok, true);

  const [rA, rB] = await Promise.all([resA, resB]);
  assert.equal(rA.result.number, 17);
  assert.equal(rB.result.number, 17); // mismo número para todos

  const [oA, oB] = await Promise.all([outA, outB]);
  assert.equal(oA.totalWin, 360);
  assert.equal(oA.user.balance, 1350);
  assert.equal(oB.totalWin, 0); // 17 es negro
  assert.equal(oB.user.balance, 900);
});

test('apostar con la mesa cerrada o sin sentarse devuelve error por el acknowledgement', async () => {
  const a = await client('t1');
  const sinSentarse = await emit(a, 'table:bet', { table: 'baccarat', bets: { player: 10 } });
  assert.equal(sinSentarse.ok, false);
  assert.equal(sinSentarse.status, 403);
  const mesaFalsa = await emit(a, 'table:join', { table: 'poker' });
  assert.equal(mesaFalsa.ok, false);
  assert.equal(mesaFalsa.status, 404);
});

test('al desconectarse un jugador su asiento se libera', async () => {
  const a = await client('t2');
  await emit(a, 'table:join', { table: 'baccarat' });
  assert.ok(tables.baccarat.seats.has('u2'));
  a.close();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(tables.baccarat.seats.has('u2'), false);
});
