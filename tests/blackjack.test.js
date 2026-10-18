const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/services/blackjackRules');
const { card, scripted } = require('./helpers');

const A = (s) => card('ACE', s);
const K = (s) => card('KING', s);

test('handScore: el As vale 11 o 1 según convenga', () => {
  assert.equal(r.handScore([A('SPADES'), K('HEARTS')]), 21);
  assert.equal(r.handScore([A('SPADES'), A('HEARTS')]), 12);
  assert.equal(r.handScore([A('SPADES'), A('HEARTS'), card(9)]), 21);
  assert.equal(r.handScore([A('SPADES'), card(6)]), 17); // 17 suave
  assert.equal(r.handScore([A('SPADES'), card(6), card(10)]), 17); // el As pasa a valer 1
});

test('handScore: se puede pasar de 21 (bust) y J, Q, K valen 10', () => {
  assert.equal(r.handScore([K('SPADES'), card('QUEEN'), card(5)]), 25);
  assert.equal(r.handScore([card('JACK'), card('QUEEN')]), 20);
});

test('isBlackjack: solo con 2 cartas que suman 21', () => {
  assert.equal(r.isBlackjack([A('SPADES'), K('HEARTS')]), true);
  assert.equal(r.isBlackjack([card(7), card(7), card(7)]), false);
  assert.equal(r.isBlackjack([A('SPADES'), card(5), card(5)]), false);
});

test('el crupier pide con 16, se planta con 17 y también con 17 suave', () => {
  assert.equal(r.dealerShouldHit([card(10), card(6)]), true);
  assert.equal(r.dealerShouldHit([card(10), card(7)]), false);
  assert.equal(r.dealerShouldHit([A('SPADES'), card(6)]), false);
});

test('dealerPlay roba hasta llegar a 17 o más', () => {
  const hand = [card(10), card(2)];
  r.dealerPlay(hand, scripted([card(3), card(4)])); // 12 -> 15 -> 19
  assert.equal(r.handScore(hand), 19);
  assert.equal(hand.length, 4);
});

test('resolveByScores: gana, empata o pierde', () => {
  assert.equal(r.resolveByScores([K('S'), card(9)], [K('H'), card(8)]), 'win');
  assert.equal(r.resolveByScores([K('S'), card(8)], [K('H'), card(8)]), 'push');
  assert.equal(r.resolveByScores([K('S'), card(7)], [K('H'), card(8)]), 'lose');
  assert.equal(r.resolveByScores([K('S'), card(2)], [K('H'), card(6), card(9)]), 'win'); // el crupier se pasa
});

test('pagos: blackjack 3 a 2, victoria 1 a 1, empate devuelve la apuesta', () => {
  assert.equal(r.mainPayout('blackjack', 100), 250);
  assert.equal(r.mainPayout('blackjack', 15), 37); // 37.5 se redondea hacia abajo
  assert.equal(r.mainPayout('win', 100), 200);
  assert.equal(r.mainPayout('push', 100), 100);
  assert.equal(r.mainPayout('lose', 100), 0);
});

test('Perfect Pairs: perfecto, mismo color, mixto y sin pareja', () => {
  assert.equal(r.evaluatePairs([K('SPADES'), K('SPADES')]), 'perfect');
  assert.equal(r.evaluatePairs([K('SPADES'), K('CLUBS')]), 'colored');
  assert.equal(r.evaluatePairs([K('SPADES'), K('HEARTS')]), 'mixed');
  assert.equal(r.evaluatePairs([K('SPADES'), card('QUEEN', 'SPADES')]), null);
  // pagos 25 a 1, 12 a 1 y 6 a 1 (el multiplicador total suma la apuesta devuelta)
  assert.deepEqual(r.PAIRS_PAYOUT, { perfect: 26, colored: 13, mixed: 7 });
});

test('21+3: cada combinación de póker', () => {
  const ev = (a, b, c) => r.evaluateTwentyOnePlusThree([a, b], c);
  assert.equal(ev(card(7, 'HEARTS'), card(7, 'HEARTS'), card(7, 'HEARTS')), 'suitedTrips');
  assert.equal(ev(card(5, 'HEARTS'), card(6, 'HEARTS'), card(7, 'HEARTS')), 'straightFlush');
  assert.equal(ev(card(7, 'SPADES'), card(7, 'HEARTS'), card(7, 'DIAMONDS')), 'threeKind');
  assert.equal(ev(card(4, 'HEARTS'), card(5, 'SPADES'), card(6, 'DIAMONDS')), 'straight');
  assert.equal(ev(card(2, 'CLUBS'), card(9, 'CLUBS'), card('KING', 'CLUBS')), 'flush');
  assert.equal(ev(card(2, 'CLUBS'), card(9, 'HEARTS'), card('KING', 'SPADES')), null);
});

test('21+3: el As cuenta alto (Q-K-A) o bajo (A-2-3) pero no da la vuelta (K-A-2)', () => {
  const ev = (a, b, c) => r.evaluateTwentyOnePlusThree([a, b], c);
  assert.equal(ev(card('QUEEN', 'HEARTS'), card('KING', 'SPADES'), A('DIAMONDS')), 'straight');
  assert.equal(ev(A('HEARTS'), card(2, 'SPADES'), card(3, 'DIAMONDS')), 'straight');
  assert.equal(ev(card('KING', 'HEARTS'), A('SPADES'), card(2, 'DIAMONDS')), null);
});

test('21+3: pagos totales 101, 41, 31, 11 y 6', () => {
  assert.deepEqual(r.THREE_PAYOUT, { suitedTrips: 101, straightFlush: 41, threeKind: 31, straight: 11, flush: 6 });
});

test('bono histórico: A de Picas + J de Picas o de Tréboles', () => {
  assert.equal(r.isHistoricBlackjack([A('SPADES'), card('JACK', 'SPADES')]), true);
  assert.equal(r.isHistoricBlackjack([A('SPADES'), card('JACK', 'CLUBS')]), true);
  assert.equal(r.isHistoricBlackjack([A('SPADES'), card('JACK', 'HEARTS')]), false);
  assert.equal(r.isHistoricBlackjack([A('HEARTS'), card('JACK', 'SPADES')]), false);
});

test('seguro: cuesta media apuesta (redondeada hacia abajo) y paga 2 a 1', () => {
  assert.equal(r.insuranceCost(100), 50);
  assert.equal(r.insuranceCost(15), 7);
  assert.equal(r.INSURANCE_PAYOUT, 3);
});
