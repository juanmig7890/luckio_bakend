// Pruebas de la mesa de Blackjack en vivo (sin red y sin base de datos: billetera y mazo son dobles de prueba).
// Lo central a probar: cada silla reparte y juega SU propia mano, pero todas comparten el mismo crupier,
// y las reglas/pagos son las mismas que la mesa individual (services/blackjackRules).
// Nota sobre los códigos de carta: el mazo propio usa "0" para el 10 (p. ej. "0H" = 10 de corazones).
const test = require('node:test');
const assert = require('node:assert/strict');
const { BlackjackTable, SEAT_COUNT } = require('../src/realtime/blackjackTable');

const FAST = { betMs: 60, insuranceMs: 40, turnMs: 40, dealerMs: 20, resultMs: 40 };

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

const table = (wallet, codes) =>
  new BlackjackTable({
    wallet,
    getUser: async (id) => ({ id, balance: wallet.balances[id] }),
    durations: FAST,
    deps: { buildShoe: () => [...codes] },
  });

const untilPhase = (t, phase) =>
  new Promise((resolve) => {
    if (t.phase === phase) return resolve();
    const on = (snap) => { if (snap.phase === phase) { t.off('state', on); resolve(); } };
    t.on('state', on);
  });

const collectOutcomes = (t) => {
  const outcomes = {};
  t.on('outcome', (o) => { outcomes[`${o.userId}:${o.seat}`] = o; });
  return outcomes;
};

test('sentarse: silla inválida, silla ocupada, o ya sentado en otra silla', () => {
  const t = table(makeWallet({ a: 1000, b: 1000 }), ['2C']);
  t.seatSit(user('a'), 0);
  assert.equal(t.seats.get(0).userId, 'a');
  assert.throws(() => t.seatSit(user('b'), 0), { status: 409 });
  assert.throws(() => t.seatSit(user('a'), 1), { status: 409 }); // ya está sentado en la 0
  assert.throws(() => t.seatSit(user('c'), 9), { status: 400 });
  t.stop();
});

test('no se puede apostar sin sentarse, con monto inválido, o repetir apuesta en la misma ronda', async () => {
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['2C']);
  await assert.rejects(t.placeBet('a', 0, { amount: 100 }), { status: 403 });
  t.seatSit(user('a'), 0);
  await assert.rejects(t.placeBet('a', 0, { amount: 5 }), { status: 400 }); // menor al mínimo
  await assert.rejects(t.placeBet('a', 0, { amount: 1.5 }), { status: 400 });
  await t.placeBet('a', 0, { amount: 100 });
  await assert.rejects(t.placeBet('a', 0, { amount: 50 }), { status: 409 }); // ya apostó esta ronda
  assert.equal(w.balances.a, 900);
  t.stop();
});

test('dos sillas independientes: cada una recibe sus propias cartas y cobra según su propia mano, con el mismo crupier', async () => {
  // Orden de reparto: silla0 c1, silla1 c1, crupier c1(visible), silla0 c2, silla1 c2, crupier c2(oculta), luego lo que pida el crupier
  const w = makeWallet({ a: 1000, b: 1000 });
  const t = table(w, ['0H', '9H', '7H', '9D', '6D', '6H', '5C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  t.seatSit(user('b'), 1);
  await t.placeBet('a', 0, { amount: 100 });
  await t.placeBet('b', 1, { amount: 50 });

  await untilPhase(t, 'playing');
  assert.deepEqual(t.currentTurn, { seat: 0, hand: 0 });
  assert.equal(t.viewSeat(0).hands[0].score, 19); // 10 + 9
  assert.equal(t.viewSeat(1).hands[0].score, 15); // 9 + 6
  await t.act('a', 0, 'stand');
  assert.deepEqual(t.currentTurn, { seat: 1, hand: 0 });
  await t.act('b', 1, 'stand');

  await untilPhase(t, 'results');
  assert.equal(t.dealerCards.length, 3); // 7H + 6H (13) pide una más -> 5C = 18
  assert.equal(outcomes['a:0'].hands[0].result, 'win'); // 19 vs 18
  assert.equal(outcomes['a:0'].totalWin, 200);
  assert.equal(outcomes['b:1'].hands[0].result, 'lose'); // 15 vs 18
  assert.equal(outcomes['b:1'].totalWin, 0);
  assert.equal(w.balances.a, 1000 - 100 + 200);
  assert.equal(w.balances.b, 1000 - 50);
  t.stop();
});

test('crupier muestra As: el seguro tomado paga 2 a 1 cuando el crupier tiene blackjack', async () => {
  // silla0 c1=9S, crupier c1=AS(visible), silla0 c2=8S, crupier c2=KH(oculta) -> crupier A+K = blackjack
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['9S', 'AS', '8S', 'KH']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });

  await untilPhase(t, 'insurance');
  assert.equal(t.viewSeat(0).insurance, 'offered');
  await t.insuranceDecision('a', 0, true); // cuesta floor(100/2)=50
  assert.equal(w.balances.a, 1000 - 100 - 50);

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].hands[0].result, 'lose'); // 17 contra blackjack del crupier
  assert.equal(outcomes['a:0'].insurancePayout, 50 * 3); // 2 a 1 + apuesta devuelta
  assert.equal(w.balances.a, 1000 - 100 - 50 + 150);
  t.stop();
});

test('rechazar el seguro y el crupier SÍ tenía blackjack: se pierde la apuesta principal', async () => {
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['9S', 'AS', '8S', 'KH']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });
  await untilPhase(t, 'insurance');
  await t.insuranceDecision('a', 0, false);

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].insurance, 'declined');
  assert.equal(outcomes['a:0'].totalWin, 0);
  assert.equal(w.balances.a, 900);
  t.stop();
});

test('pedir carta hasta pasarse de 21 pierde esa silla sin afectar a la otra, que gana su propia mano', async () => {
  // silla0: 9H + 6H = 15, pide 9C -> 24 (se pasa). silla1: 10D + 8C = 18, se planta y gana (crupier se planta en 17).
  const w = makeWallet({ a: 1000, b: 1000 });
  const t = table(w, ['9H', '0D', '9D', '6H', '8C', '8D', '9C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  t.seatSit(user('b'), 1);
  await t.placeBet('a', 0, { amount: 100 });
  await t.placeBet('b', 1, { amount: 100 });

  await untilPhase(t, 'playing');
  await t.act('a', 0, 'hit'); // 15 + 9 = 24, se pasa y avanza sola
  assert.equal(t.viewSeat(0).hands[0].result, 'lose');
  assert.deepEqual(t.currentTurn, { seat: 1, hand: 0 });
  await t.act('b', 1, 'stand');

  await untilPhase(t, 'results');
  assert.equal(t.dealerCards.length, 2); // 9D + 8D = 17: el crupier ya se planta, no pide más
  assert.equal(outcomes['b:1'].hands[0].result, 'win'); // 18 vs 17
  assert.equal(w.balances.a, 900); // perdió su mano
  assert.equal(w.balances.b, 1000 - 100 + 200); // ganó la suya, de forma independiente
  t.stop();
});

test('doblar cobra otra apuesta, da una sola carta y paga el doble si se gana', async () => {
  // silla0: 5H + 6H = 11, dobla y recibe 0C(10) = 21. Crupier 7D + 2C = 9, pide 8C = 17 (se planta).
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['5H', '7D', '6H', '2C', '0C', '8C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });
  await untilPhase(t, 'playing');

  await t.act('a', 0, 'double');
  assert.equal(w.balances.a, 1000 - 100 - 100);
  assert.equal(t.viewSeat(0).hands[0].score, 21);
  assert.equal(t.viewSeat(0).hands[0].doubled, true);

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].hands[0].result, 'win');
  assert.equal(outcomes['a:0'].totalWin, 400); // bet doblada (200) x2
  assert.equal(w.balances.a, 1000 - 200 + 400);
  t.stop();
});

test('dividir separa la mano en dos independientes, cada una con su propia apuesta y resultado', async () => {
  // silla0: 8S + 8H (par). Crupier 9D + 9C = 18 (se planta: ya es >=17).
  // Tras dividir: mano1 recibe 2C (8+2=10), mano2 recibe 3C (8+3=11).
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['8S', '9D', '8H', '9C', '2C', '3C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });
  await untilPhase(t, 'playing');

  await t.act('a', 0, 'split');
  assert.equal(w.balances.a, 1000 - 100 - 100);
  assert.equal(t.viewSeat(0).hands.length, 2);
  assert.equal(t.viewSeat(0).hands[0].score, 10);
  assert.equal(t.viewSeat(0).hands[1].score, 11);

  await t.act('a', 0, 'stand'); // mano 1 (10)
  await t.act('a', 0, 'stand'); // mano 2 (11)

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].hands[0].result, 'lose'); // 10 vs 18
  assert.equal(outcomes['a:0'].hands[1].result, 'lose'); // 11 vs 18
  assert.equal(w.balances.a, 1000 - 200);
  t.stop();
});

test('retirarse (surrender) devuelve la mitad de la apuesta', async () => {
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['0H', '7D', '6H', '2C', '8C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });
  await untilPhase(t, 'playing');
  await t.act('a', 0, 'surrender');

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].hands[0].result, 'surrender');
  assert.equal(outcomes['a:0'].totalWin, 50);
  assert.equal(w.balances.a, 1000 - 100 + 50);
  t.stop();
});

test('Charlie de 5 cartas gana automáticamente 1 a 1 aunque el crupier tenga más', async () => {
  // silla0: 2+2 = 4, pide 3 veces más (2, 2, 3) -> 5 cartas sin pasarse de 21 = Charlie, gana sola.
  const w = makeWallet({ a: 1000 });
  const t = table(w, ['2C', '7D', '2D', '6H', '2H', '2S', '3C']);
  const outcomes = collectOutcomes(t);
  t.seatSit(user('a'), 0);
  await t.placeBet('a', 0, { amount: 100 });
  await untilPhase(t, 'playing');

  await t.act('a', 0, 'hit'); // 4 + 2 = 6 (3 cartas)
  await t.act('a', 0, 'hit'); // + 2 = 8 (4 cartas)
  await t.act('a', 0, 'hit'); // + 3 = 11 (5 cartas) -> Charlie
  assert.equal(t.viewSeat(0).hands[0].result, 'win');
  assert.equal(t.viewSeat(0).hands[0].charlie, true);

  await untilPhase(t, 'results');
  assert.equal(outcomes['a:0'].totalWin, 200);
  t.stop();
});

test('el turno que nadie responde se planta solo (tiempo agotado) y cada silla se liquida igual', async () => {
  const w = makeWallet({ a: 1000, b: 1000 });
  const t = table(w, ['0H', '0D', '2C', '7D', '9D', '3C', '9C', '5C']);
  t.seatSit(user('a'), 0);
  t.seatSit(user('b'), 1);
  await t.placeBet('a', 0, { amount: 100 });
  await t.placeBet('b', 1, { amount: 100 });

  await untilPhase(t, 'playing');
  assert.deepEqual(t.currentTurn, { seat: 0, hand: 0 });
  await untilPhase(t, 'results'); // nadie actúa: ambas sillas se plantan solas por tiempo
  assert.equal(t.history[0].seats.length, 2);
  t.stop();
});

test('pararse de la silla la libera para la siguiente ronda; desconectarse hace lo mismo', async () => {
  const w = makeWallet({ a: 1000, b: 1000 });
  const t = table(w, ['2C']);
  t.seatSit(user('a'), 0);
  assert.throws(() => t.seatSit(user('b'), 0), { status: 409 });
  t.standUp('a');
  assert.equal(t.seats.has(0), false);
  t.seatSit(user('b'), 0); // ahora sí puede sentarse
  assert.equal(t.seats.get(0).userId, 'b');
  t.leave('b'); // leave() también libera la silla (equivalente a desconectarse)
  assert.equal(t.seats.has(0), false);
  t.stop();
});

test('la mesa tiene exactamente 6 sillas', () => {
  assert.equal(SEAT_COUNT, 6);
});
