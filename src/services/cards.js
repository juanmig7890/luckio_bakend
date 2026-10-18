// Mazo propio: reemplaza a la API externa deckofcardsapi.com.
// Ventajas: no depende de internet, es más rápido y se puede probar con mazos controlados.
const { randomInt } = require('../utils/rng');

const SUITS = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
const VALUES = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];
const SUIT_CODE = { SPADES: 'S', HEARTS: 'H', DIAMONDS: 'D', CLUBS: 'C' };
const VALUE_CODE = { ACE: 'A', 10: '0', JACK: 'J', QUEEN: 'Q', KING: 'K' };

const codeOf = (value, suit) => `${VALUE_CODE[value] || value}${SUIT_CODE[suit]}`;

const CODE_TO_CARD = new Map();
VALUES.forEach((value) =>
  SUITS.forEach((suit) => CODE_TO_CARD.set(codeOf(value, suit), { code: codeOf(value, suit), value, suit }))
);

const fromCode = (code) => {
  const card = CODE_TO_CARD.get(code);
  if (!card) throw new Error(`Código de carta inválido: ${code}`);
  return { ...card };
};

// Devuelve el mazo como lista de códigos ("AS", "0H"...), barajado con Fisher-Yates y aleatoriedad criptográfica.
// Se guarda como texto para que ocupe poco en la base de datos.
const buildShoe = (decks = 6, rnd = randomInt) => {
  const shoe = [];
  for (let d = 0; d < decks; d++) CODE_TO_CARD.forEach((_, code) => shoe.push(code));
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
};

// Saca n cartas del principio del mazo (modifica el arreglo recibido).
const draw = (shoe, n = 1) => {
  if (shoe.length < n) {
    const err = new Error('El mazo se quedó sin cartas');
    err.status = 500;
    throw err;
  }
  return shoe.splice(0, n).map(fromCode);
};

module.exports = { SUITS, VALUES, buildShoe, draw, fromCode, codeOf };
