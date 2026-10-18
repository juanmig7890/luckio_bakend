const { codeOf } = require('../src/services/cards');

// card('ACE','SPADES') -> { code:'AS', value:'ACE', suit:'SPADES' }
const card = (value, suit = 'SPADES') => ({ code: codeOf(String(value), suit), value: String(value), suit });

// Devuelve una función "drawOne" que entrega las cartas en el orden dado
const scripted = (list) => {
  const queue = [...list];
  return () => {
    if (!queue.length) throw new Error('Se acabaron las cartas del guion');
    return queue.shift();
  };
};

module.exports = { card, scripted };
