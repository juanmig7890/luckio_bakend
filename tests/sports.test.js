// Reglas puras de apuestas deportivas: resolver una selección contra un marcador real.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/sportsRules');

const score = (home, away, homeScore, awayScore) => ({
  home_team: home,
  away_team: away,
  scores: [
    { name: home, score: String(homeScore) },
    { name: away, score: String(awayScore) },
  ],
  completed: true,
});

test('h2h: gana el pick si coincide con el equipo ganador real, o con "Draw" si empataron', () => {
  const sc = score('Real Madrid', 'Barcelona', 2, 1);
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'Real Madrid' }, sc), 'won');
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'Barcelona' }, sc), 'lost');
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'Draw' }, sc), 'lost');

  const draw = score('Real Madrid', 'Barcelona', 1, 1);
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'Draw' }, draw), 'won');
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'Real Madrid' }, draw), 'lost');
});

test('totals: Over/Under contra la suma real de goles, y empuja si cae justo en la línea', () => {
  const sc = score('A', 'B', 2, 1); // total 3
  assert.equal(rules.resolveLeg({ market: 'totals', pick: 'Over', point: 2.5 }, sc), 'won');
  assert.equal(rules.resolveLeg({ market: 'totals', pick: 'Under', point: 2.5 }, sc), 'lost');
  assert.equal(rules.resolveLeg({ market: 'totals', pick: 'Over', point: 3 }, sc), 'push');
  assert.equal(rules.resolveLeg({ market: 'totals', pick: 'Under', point: 3 }, sc), 'push');
});

test('sin marcador disponible todavía devuelve null (ni ganó ni perdió, hay que esperar)', () => {
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'A' }, { home_team: 'A', away_team: 'B', scores: null }), null);
  assert.equal(rules.resolveLeg({ market: 'h2h', pick: 'A' }, { home_team: 'A', away_team: 'B', scores: [{ name: 'A', score: 'x' }] }), null);
});

test('payoutFor: ganó paga el premio completo, empujó devuelve solo la apuesta, perdió no paga nada', () => {
  assert.equal(rules.payoutFor('won', 100, 250), 250);
  assert.equal(rules.payoutFor('push', 100, 250), 100);
  assert.equal(rules.payoutFor('lost', 100, 250), 0);
});
