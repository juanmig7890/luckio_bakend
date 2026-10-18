const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShoe, draw, fromCode } = require('../src/services/cards');

test('un mazo de 6 barajas tiene 312 cartas y cada una aparece 6 veces', () => {
  const shoe = buildShoe(6);
  assert.equal(shoe.length, 312);
  const counts = {};
  shoe.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  assert.equal(Object.keys(counts).length, 52);
  assert.ok(Object.values(counts).every((n) => n === 6));
});

test('el mazo queda barajado (no sale en el orden de fábrica)', () => {
  const a = buildShoe(1);
  const b = buildShoe(1);
  assert.notDeepEqual(a, b);
});

test('draw saca cartas del principio y las elimina del mazo', () => {
  const shoe = ['AS', '0H', 'KD'];
  const got = draw(shoe, 2);
  assert.deepEqual(got.map((c) => c.code), ['AS', '0H']);
  assert.deepEqual(shoe, ['KD']);
});

test('draw falla si no quedan cartas suficientes', () => {
  assert.throws(() => draw(['AS'], 2), /sin cartas/);
});

test('fromCode entiende el 10 (código "0") y rechaza códigos inválidos', () => {
  assert.deepEqual(fromCode('0H'), { code: '0H', value: '10', suit: 'HEARTS' });
  assert.throws(() => fromCode('ZZ'));
});
