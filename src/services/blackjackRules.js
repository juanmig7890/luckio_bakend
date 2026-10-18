// Reglas puras de Blackjack (sin base de datos): así se pueden probar de forma aislada.

const cardValue = (v) => {
  if (v === 'ACE') return 11;
  if (['KING', 'QUEEN', 'JACK'].includes(v)) return 10;
  return Number(v);
};

// El As cuenta 11 salvo que eso haga pasar de 21; entonces cuenta 1.
const handScore = (cards) => {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.value);
    if (c.value === 'ACE') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
};

const isBlackjack = (cards) => cards.length === 2 && handScore(cards) === 21;

// El crupier pide con 16 o menos y se planta con 17 o más (también en 17 suave).
const dealerShouldHit = (cards) => handScore(cards) < 17;

const dealerPlay = (dealerCards, drawOne) => {
  while (dealerShouldHit(dealerCards)) dealerCards.push(drawOne());
  return dealerCards;
};

const resolveByScores = (playerCards, dealerCards) => {
  const p = handScore(playerCards);
  const d = handScore(dealerCards);
  if (d > 21 || p > d) return 'win';
  if (p === d) return 'push';
  return 'lose';
};

// Pago TOTAL (incluye la apuesta devuelta)
const mainPayout = (result, bet) => {
  switch (result) {
    case 'blackjack': return Math.floor(bet * 2.5); // 3 a 2
    case 'win': return bet * 2; // 1 a 1
    case 'push': return bet;
    case 'surrender': return Math.floor(bet / 2); // se devuelve la mitad
    default: return 0;
  }
};

// ---- Dividir (split) y Charlie de 5 cartas ----
const MAX_HANDS = 4; // se puede dividir hasta 3 veces => 4 manos

// Se puede dividir con 2 cartas del mismo valor (K y Q también, valen 10), si hay espacio para otra mano
// y la mano no viene de dividir Ases (los Ases divididos no se vuelven a dividir).
const canSplit = (hand, handCount) =>
  Boolean(hand) &&
  hand.cards.length === 2 &&
  cardValue(hand.cards[0].value) === cardValue(hand.cards[1].value) &&
  handCount < MAX_HANDS &&
  !hand.splitAce;

// Charlie: 5 cartas o más sin pasarse de 21 gana automáticamente 1 a 1 (regla a favor del jugador)
const CHARLIE_CARDS = 5;
const isCharlie = (cards) => cards.length >= CHARLIE_CARDS && handScore(cards) <= 21;

// ---- Perfect Pairs ----
const SUIT_COLOR = { SPADES: 'black', CLUBS: 'black', HEARTS: 'red', DIAMONDS: 'red' };
// Multiplicador TOTAL (incluye la apuesta devuelta): par perfecto 25 a 1, mismo color 12 a 1, mixto 6 a 1
const PAIRS_PAYOUT = { perfect: 26, colored: 13, mixed: 7 };

const evaluatePairs = ([c1, c2]) => {
  if (!c1 || !c2 || c1.value !== c2.value) return null;
  if (c1.suit === c2.suit) return 'perfect';
  if (SUIT_COLOR[c1.suit] === SUIT_COLOR[c2.suit]) return 'colored';
  return 'mixed';
};

// ---- 21+3: tus 2 cartas + la carta visible del crupier forman una mano de póker de 3 cartas ----
const THREE_PAYOUT = { suitedTrips: 101, straightFlush: 41, threeKind: 31, straight: 11, flush: 6 }; // multiplicador total
const RANK = { ACE: 1, JACK: 11, QUEEN: 12, KING: 13 };
const rankOf = (v) => RANK[v] || Number(v);

const isStraight = (ranks) => {
  const check = (r) => {
    const s = [...r].sort((a, b) => a - b);
    return s[1] === s[0] + 1 && s[2] === s[1] + 1;
  };
  if (check(ranks)) return true;
  // El As también puede valer 14 (Q-K-A), pero no hay "vuelta" (K-A-2 no es escalera)
  return ranks.includes(1) && check(ranks.map((r) => (r === 1 ? 14 : r)));
};

const evaluateTwentyOnePlusThree = (playerCards, dealerUpcard) => {
  if (!playerCards || playerCards.length < 2 || !dealerUpcard) return null;
  const cards = [playerCards[0], playerCards[1], dealerUpcard];
  const ranks = cards.map((c) => rankOf(c.value));
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const trips = ranks.every((r) => r === ranks[0]);
  const straight = !trips && isStraight(ranks);

  if (trips && flush) return 'suitedTrips';
  if (straight && flush) return 'straightFlush';
  if (trips) return 'threeKind';
  if (straight) return 'straight';
  if (flush) return 'flush';
  return null;
};

// ---- Bono histórico: As de Picas + Jota negra (origen del nombre "Blackjack") ----
const isHistoricBlackjack = (cards) =>
  cards.length === 2 && cards.some((c) => c.code === 'AS') && cards.some((c) => c.code === 'JS' || c.code === 'JC');

// ---- Seguro: se ofrece si la carta visible del crupier es un As. Cuesta media apuesta y paga 2 a 1 ----
const INSURANCE_PAYOUT = 3; // multiplicador total (2 a 1 + apuesta devuelta)
const insuranceCost = (bet) => Math.floor(bet / 2);

module.exports = {
  cardValue,
  handScore,
  isBlackjack,
  canSplit,
  isCharlie,
  MAX_HANDS,
  CHARLIE_CARDS,
  dealerShouldHit,
  dealerPlay,
  resolveByScores,
  mainPayout,
  evaluatePairs,
  evaluateTwentyOnePlusThree,
  isHistoricBlackjack,
  insuranceCost,
  PAIRS_PAYOUT,
  THREE_PAYOUT,
  INSURANCE_PAYOUT,
};
