// Reglas puras de Bacará (Punto Banco).

const TEN_VALUES = new Set(['10', 'JACK', 'QUEEN', 'KING']);

// As = 1, del 2 al 9 su número, 10/J/Q/K = 0
const points = (card) => {
  if (card.value === 'ACE') return 1;
  if (TEN_VALUES.has(card.value)) return 0;
  return Number(card.value);
};

// Solo cuenta el último dígito de la suma
const total = (cards) => cards.reduce((s, c) => s + points(c), 0) % 10;

const playerDraws = (playerTotal) => playerTotal <= 5;

// Tabla de la tercera carta de la Banca (playerThird = tercera carta del Punto, o null si el Punto se plantó)
const bankerDraws = (bankerTotal, playerThird) => {
  if (!playerThird) return bankerTotal <= 5;
  const p = points(playerThird);
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2: return true;
    case 3: return p !== 8;
    case 4: return p >= 2 && p <= 7;
    case 5: return p >= 4 && p <= 7;
    case 6: return p === 6 || p === 7;
    default: return false; // 7 se planta
  }
};

// Reparte una ronda completa. drawOne() entrega la siguiente carta del mazo.
// Orden real de reparto: Punto, Banca, Punto, Banca.
const dealRound = (drawOne) => {
  const playerCards = [drawOne()];
  const bankerCards = [drawOne()];
  playerCards.push(drawOne());
  bankerCards.push(drawOne());

  const natural = total(playerCards) >= 8 || total(bankerCards) >= 8;
  if (!natural) {
    if (playerDraws(total(playerCards))) playerCards.push(drawOne());
    const playerThird = playerCards[2] || null;
    if (bankerDraws(total(bankerCards), playerThird)) bankerCards.push(drawOne());
  }

  const playerTotal = total(playerCards);
  const bankerTotal = total(bankerCards);
  const winner = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';

  return {
    playerCards,
    bankerCards,
    playerTotal,
    bankerTotal,
    winner,
    natural,
    // Par = las 2 primeras cartas tienen el mismo valor (K con K, pero no K con 10)
    playerPair: playerCards[0].value === playerCards[1].value,
    bankerPair: bankerCards[0].value === bankerCards[1].value,
  };
};

const BANKER_COMMISSION = 0.05;
const TIE_PAYS = 8; // 8 a 1
const PAIR_PAYS = 11; // 11 a 1

// Devuelve, por tipo de apuesta, cuánto se devuelve al jugador (apuesta incluida). Perder = 0.
const settle = (bets, round) => {
  const b = (k) => Number(bets[k]) || 0;
  const tie = round.winner === 'tie';
  return {
    player: round.winner === 'player' ? b('player') * 2 : tie ? b('player') : 0,
    banker:
      round.winner === 'banker' ? b('banker') + Math.floor(b('banker') * (1 - BANKER_COMMISSION)) : tie ? b('banker') : 0,
    tie: tie ? b('tie') * (TIE_PAYS + 1) : 0,
    playerPair: round.playerPair ? b('playerPair') * (PAIR_PAYS + 1) : 0,
    bankerPair: round.bankerPair ? b('bankerPair') * (PAIR_PAYS + 1) : 0,
  };
};

// En una mesa real no se apuesta a Punto Y a Banca en la misma mano: una de las dos siempre pierde su
// comisión o su sentido, así que las casas no lo permiten. Se usa tanto en la mesa individual como en vivo.
const conflictsPlayerBanker = (bets) => Number(bets?.player) > 0 && Number(bets?.banker) > 0;

module.exports = { points, total, playerDraws, bankerDraws, dealRound, settle, conflictsPlayerBanker, BANKER_COMMISSION, TIE_PAYS, PAIR_PAYS };
