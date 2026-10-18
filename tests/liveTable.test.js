// Pruebas del motor de mesas en vivo (sin red y sin base de datos: billetera y sorteos son dobles de prueba).
const test = require('node:test');
const assert = require('node:assert/strict');
const RouletteTable = require('../src/realtime/rouletteTable');
const BaccaratTable = require('../src/realtime/baccaratTable');

const FAST = { betMs: 60, resolveMs: 40, resultMs: 40 };

const makeWallet = (initial = {}) => {
  const balances = { ...initial };
  const log = [];
  return {
    balances,
    log,
    placeBet: async (id, amount) => {
      if (balances[id] < amount) throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
      balances[id] -= amount;
      log.push(['bet', id, amount]);
      return { _id: id, balance: balances[id] };
    },
    creditWin: async (id, amount) => {
      balances[id] += amount;
      log.push(['win', id, amount]);
      return { _id: id, balance: balances[id] };
    },
  };
};

const user = (id, name = `jugador${id}`) => ({ _id: id, username: name });

const roulette = (wallet, number = 17, extra = {}) =>
  new RouletteTable({
    wallet,
    getUser: async (id) => ({ id, balance: wallet.balances[id] }),
    durations: FAST,
    deps: { spinNumber: () => number, recordSpin: async () => {}, getHotNumbers: async () => [], ...extra },
  });

// Espera a que la mesa llegue a una fase
const untilPhase = (table, phase) =>
  new Promise((resolve) => {
    if (table.phase === phase) return resolve();
    const on = (snap) => { if (snap.phase === phase) { table.off('state', on); table.off('resolving', on); resolve(); } };
    table.on('state', on);
    table.on('resolving', on);
  });

const collectOutcomes = (table) => {
  const outcomes = {};
  table.on('outcome', (o) => { outcomes[o.userId] = o; });
  return outcomes;
};

test('al sentarse el primer jugador la mesa pasa de reposo a la fase de apuestas', () => {
  const t = roulette(makeWallet({ a: 1000 }));
  assert.equal(t.phase, 'idle');
  t.join(user('a'));
  assert.equal(t.phase, 'betting');
  assert.equal(t.roundNo, 1);
  assert.ok(t.endsAt > t.now());
  t.stop();
});

test('no se puede apostar sin sentarse ni con apuestas inválidas', async () => {
  const w = makeWallet({ a: 1000 });
  const t = roulette(w);
  await assert.rejects(t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 50 }]), { status: 403 });
  t.join(user('a'));
  await assert.rejects(t.placeBets('a', []), { status: 400 });
  await assert.rejects(t.placeBets('a', [{ betType: 'color', selection: 'verde', amount: 50 }]), { status: 400 });
  await assert.rejects(t.placeBets('a', [{ betType: 'straight', selection: 99, amount: 50 }]), { status: 400 });
  await assert.rejects(t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 5 }]), { status: 400 });
  assert.equal(w.balances.a, 1000); // nada se cobró
  t.stop();
});

test('ruleta en vivo: todos comparten el mismo número y cada jugador cobra según SUS apuestas', async () => {
  const w = makeWallet({ a: 1000, b: 1000 });
  const t = roulette(w, 17); // 17 es negro e impar
  const outcomes = collectOutcomes(t);
  t.join(user('a'));
  t.join(user('b'));
  await t.placeBets('a', [{ betType: 'straight', selection: 17, amount: 10 }, { betType: 'color', selection: 'red', amount: 100 }]);
  await t.placeBets('b', [{ betType: 'color', selection: 'black', amount: 200 }]);
  assert.equal(w.balances.a, 1000 - 110);
  assert.equal(w.balances.b, 1000 - 200);

  await untilPhase(t, 'results');
  assert.equal(outcomes.a.number, 17);
  assert.equal(outcomes.b.number, 17);
  assert.equal(outcomes.a.totalWin, 10 * 36); // pleno paga 36x en total
  assert.equal(outcomes.b.totalWin, 200 * 2);
  assert.equal(w.balances.a, 1000 - 110 + 360);
  assert.equal(w.balances.b, 1000 - 200 + 400);
  assert.deepEqual(t.history[0], { number: 17, color: 'black' });
  t.stop();
});

test('las apuestas del mismo jugador en la misma casilla se suman y el saldo insuficiente no registra nada', async () => {
  const w = makeWallet({ a: 150 });
  const t = roulette(w, 4);
  t.join(user('a'));
  await t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 50 }]);
  await t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 50 }]);
  assert.deepEqual(t.bets.get('a').items, [{ betType: 'color', selection: 'red', amount: 100 }]);
  await assert.rejects(t.placeBets('a', [{ betType: 'straight', selection: 4, amount: 100 }]), { status: 400 });
  assert.equal(w.balances.a, 50);
  assert.equal(t.bets.get('a').total, 100);
  t.stop();
});

test('doble clic: dos apuestas simultáneas del mismo jugador no se pisan', async () => {
  const w = makeWallet({ a: 1000 });
  const t = roulette(w);
  t.join(user('a'));
  await Promise.all([
    t.placeBets('a', [{ betType: 'straight', selection: 1, amount: 100 }]),
    t.placeBets('a', [{ betType: 'straight', selection: 2, amount: 100 }]),
  ]);
  assert.equal(t.bets.get('a').items.length, 2);
  assert.equal(t.bets.get('a').total, 200);
  assert.equal(w.balances.a, 800);
  t.stop();
});

test('con las apuestas cerradas se rechaza apostar y no se cobra', async () => {
  const w = makeWallet({ a: 1000 });
  const t = roulette(w);
  t.join(user('a'));
  await untilPhase(t, 'resolving');
  await assert.rejects(t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 50 }]), { status: 409 });
  assert.equal(w.balances.a, 1000);
  t.stop();
});

test('el tope de 100,000 por jugador y ronda se respeta', async () => {
  const w = makeWallet({ a: 1_000_000 });
  const t = roulette(w);
  t.join(user('a'));
  await t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 100000 }]);
  await assert.rejects(t.placeBets('a', [{ betType: 'color', selection: 'black', amount: 10 }]), { status: 400 });
  t.stop();
});

test('ronda sin apuestas igualmente sortea y sigue; si todos se van, la mesa se detiene', async () => {
  const w = makeWallet({ a: 1000 });
  const t = roulette(w);
  t.join(user('a'));
  await untilPhase(t, 'results');
  assert.equal(t.history.length, 1);
  t.leave('a');
  await untilPhase(t, 'idle');
  assert.equal(t.phase, 'idle');
});

test('si el sorteo falla se devuelve lo apostado y la mesa sigue viva', async () => {
  const w = makeWallet({ a: 1000 });
  const t = roulette(w, 17, { recordSpin: async () => { throw new Error('BD caída'); } });
  t.on('error', () => {});
  t.join(user('a'));
  await t.placeBets('a', [{ betType: 'color', selection: 'red', amount: 100 }]);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(w.balances.a, 1000); // devolución completa
  assert.ok(t.phase === 'betting' || t.phase === 'idle');
  t.stop();
});

test('bacará en vivo: una sola mano para todos, cada quien cobra sus apuestas (Punto natural 8)', async () => {
  const w = makeWallet({ a: 1000, b: 1000 });
  const saved = [];
  const t = new BaccaratTable({
    wallet: w,
    getUser: async (id) => ({ id, balance: w.balances[id] }),
    durations: FAST,
    deps: {
      // Reparto: Punto 8, Banca 2, Punto K, Banca 3 -> Punto 8 (natural) vs Banca 5
      buildShoe: () => ['8S', '2H', 'KD', '3C', '2C', '2D'],
      recordRound: async (doc) => { saved.push(doc); },
    },
  });
  const outcomes = collectOutcomes(t);
  t.join(user('a'));
  t.join(user('b'));
  await t.placeBets('a', { player: 100, playerPair: 20 });
  await t.placeBets('b', { banker: 100 });
  await untilPhase(t, 'results');

  assert.equal(outcomes.a.totalWin, 200); // Punto paga 1 a 1; sin par
  assert.equal(outcomes.b.totalWin, 0); // la Banca perdió
  assert.equal(w.balances.a, 1000 - 120 + 200);
  assert.equal(w.balances.b, 900);
  assert.equal(saved.length, 2); // se guarda la ronda de cada jugador
  assert.equal(t.history[0].winner, 'player');
  t.stop();
});

test('bacará: apuesta sin casillas o con monto menor al mínimo se rechaza', async () => {
  const w = makeWallet({ a: 1000 });
  const t = new BaccaratTable({ wallet: w, getUser: async () => null, durations: FAST });
  t.join(user('a'));
  await assert.rejects(t.placeBets('a', {}), { status: 400 });
  await assert.rejects(t.placeBets('a', { player: 5 }), { status: 400 });
  await assert.rejects(t.placeBets('a', { player: 'x' }), { status: 400 });
  t.stop();
});
