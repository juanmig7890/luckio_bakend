const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../src/services/baccaratRules');
const { buildShoe, draw } = require('../src/services/cards');
const { card, scripted } = require('./helpers');

test('valores: As=1, 10/J/Q/K=0 y solo cuenta el último dígito', () => {
  assert.equal(b.points(card('ACE')), 1);
  assert.equal(b.points(card('KING')), 0);
  assert.equal(b.points(card(10)), 0);
  assert.equal(b.points(card(7)), 7);
  assert.equal(b.total([card(7), card(8)]), 5); // 15 -> 5
  assert.equal(b.total([card('KING'), card('QUEEN')]), 0);
});

test('el Punto pide con 0-5 y se planta con 6-7', () => {
  for (let t = 0; t <= 5; t++) assert.equal(b.playerDraws(t), true);
  assert.equal(b.playerDraws(6), false);
  assert.equal(b.playerDraws(7), false);
});

test('tabla de la tercera carta de la Banca', () => {
  const expected = {
    0: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    3: [0, 1, 2, 3, 4, 5, 6, 7, 9], // todas menos 8
    4: [2, 3, 4, 5, 6, 7],
    5: [4, 5, 6, 7],
    6: [6, 7],
    7: [],
  };
  for (const [bankerTotal, drawOn] of Object.entries(expected)) {
    for (let p = 0; p <= 9; p++) {
      const third = p === 0 ? card('KING') : card(p);
      assert.equal(b.bankerDraws(Number(bankerTotal), third), drawOn.includes(p), `banca ${bankerTotal} / tercera del punto ${p}`);
    }
  }
});

test('si el Punto se planta, la Banca pide con 0-5 y se planta con 6-7', () => {
  assert.equal(b.bankerDraws(5, null), true);
  assert.equal(b.bankerDraws(6, null), false);
});

test('natural: con 8 o 9 nadie pide más cartas', () => {
  // Punto: 4+5=9. Banca: 2+3=5. Reparto: P, B, P, B
  const round = b.dealRound(scripted([card(4), card(2), card(5), card(3)]));
  assert.equal(round.natural, true);
  assert.equal(round.playerCards.length, 2);
  assert.equal(round.bankerCards.length, 2);
  assert.equal(round.winner, 'player');
});

test('el Punto con 6 se planta y la Banca con 5 pide', () => {
  // Punto: 2+4=6 se planta. Banca: 2+3=5 pide un 1 -> 6. Empate 6-6
  const round = b.dealRound(scripted([card(2), card(2), card(4), card(3), card('ACE')]));
  assert.equal(round.playerCards.length, 2);
  assert.equal(round.bankerCards.length, 3);
  assert.equal(round.winner, 'tie');
});

test('el Punto pide y la Banca decide según esa tercera carta', () => {
  // Punto: 2+3=5 pide un 8 -> 3. Banca: 2+1=3 con tercera del Punto = 8 se planta
  const round = b.dealRound(scripted([card(2), card(2), card(3), card('ACE'), card(8)]));
  assert.equal(round.playerCards.length, 3);
  assert.equal(round.bankerCards.length, 2);
  assert.equal(round.playerTotal, 3);
  assert.equal(round.bankerTotal, 3);
  assert.equal(round.winner, 'tie');
});

test('pares: solo cuentan cartas del mismo valor (K con K sí, K con 10 no)', () => {
  const pair = b.dealRound(scripted([card('KING', 'SPADES'), card(2), card('KING', 'HEARTS'), card(3), card(5), card(2)]));
  assert.equal(pair.playerPair, true);
  assert.equal(pair.bankerPair, false);
  const noPair = b.dealRound(scripted([card('KING'), card(2), card(10), card(3), card(5), card(2)]));
  assert.equal(noPair.playerPair, false);
});

test('pagos: Punto 1 a 1, Banca 1 a 1 menos 5%, Empate 8 a 1, pares 11 a 1', () => {
  const base = { playerPair: false, bankerPair: false };
  assert.deepEqual(b.settle({ player: 100, banker: 100 }, { ...base, winner: 'player' }), { player: 200, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 });
  assert.equal(b.settle({ banker: 100 }, { ...base, winner: 'banker' }).banker, 195);
  assert.equal(b.settle({ tie: 100 }, { ...base, winner: 'tie' }).tie, 900);
  assert.equal(b.settle({ playerPair: 10, bankerPair: 10 }, { winner: 'banker', playerPair: true, bankerPair: false }).playerPair, 120);
});

test('en empate se devuelven las apuestas al Punto y a la Banca', () => {
  const p = b.settle({ player: 100, banker: 50 }, { winner: 'tie', playerPair: false, bankerPair: false });
  assert.equal(p.player, 100);
  assert.equal(p.banker, 50);
});

test('simulación: las frecuencias se parecen a las teóricas (Banca ~45.9%, Punto ~44.6%, Empate ~9.5%)', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  const N = 60000;
  const wins = { player: 0, banker: 0, tie: 0 };
  for (let i = 0; i < N; i++) {
    const shoe = buildShoe(8, rnd);
    wins[b.dealRound(() => draw(shoe, 1)[0]).winner]++;
  }
  const near = (got, want) => Math.abs(got / N - want) < 0.01;
  assert.ok(near(wins.banker, 0.4586), `banca ${wins.banker / N}`);
  assert.ok(near(wins.player, 0.4462), `punto ${wins.player / N}`);
  assert.ok(near(wins.tie, 0.0952), `empate ${wins.tie / N}`);
});
