const BlackjackGame = require('../models/BlackjackGame');
const User = require('../models/User');
const cards = require('../services/cards');
const rules = require('../services/blackjackRules');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');
const { exclusivo } = require('../utils/mutex');

const { handScore, isBlackjack, newHand, closeIfOver } = rules;

const sendError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// Partidas guardadas antes de existir "dividir" solo tenían playerCards: se convierten a una mano
const ensureHands = (game) => {
  if (!game.hands || game.hands.length === 0) {
    game.hands = [newHand(game.playerCards, game.bet, { done: game.status === 'finished', result: game.result, payout: game.payout })];
    game.activeHand = 0;
  }
  return game;
};

const totalBet = (game) => game.hands.reduce((sum, h) => sum + h.bet, 0);
const activeOf = (game) => game.hands[game.activeHand] || game.hands[0];

// Lo que ve el cliente: nunca se envía la carta oculta del crupier ni el mazo mientras la mano está activa
const view = (game) => {
  ensureHands(game);
  const active = game.status === 'active';
  const dealerCards = active ? [game.dealerCards[0], { hidden: true }] : game.dealerCards;
  const deciding = active && game.insurance === 'offered';
  const current = activeOf(game);
  const canPlay = active && !deciding;
  return {
    id: game._id,
    bet: totalBet(game),
    pairsBet: game.pairsBet,
    pairsType: game.pairsType,
    pairsPayout: game.pairsPayout,
    threeBet: game.threeBet,
    threeType: game.threeType,
    threePayout: game.threePayout,
    insurance: game.insurance,
    insuranceBet: game.insuranceBet,
    insurancePayout: game.insurancePayout,
    isHistoricBlackjack: game.isHistoricBlackjack,
    status: game.status,
    result: game.result,
    payout: game.payout,
    hands: game.hands.map((h, i) => ({
      cards: h.cards,
      bet: h.bet,
      score: handScore(h.cards),
      done: h.done,
      doubled: h.doubled,
      fromSplit: h.fromSplit,
      charlie: rules.isCharlie(h.cards),
      result: h.result,
      payout: h.payout,
      active: active && !deciding && i === game.activeHand,
    })),
    activeHand: game.activeHand,
    // Atajos de la mano en juego (compatibilidad con la versión de una sola mano)
    playerCards: current.cards,
    playerScore: handScore(current.cards),
    dealerCards,
    dealerScore: active ? handScore([game.dealerCards[0]]) : handScore(game.dealerCards),
    canInsure: deciding,
    canHit: canPlay,
    canDouble: canPlay && current.cards.length === 2,
    canSplit: canPlay && rules.canSplit(current, game.hands.length),
    canSurrender: canPlay && game.hands.length === 1 && current.cards.length === 2,
  };
};

// Cierra la partida: calcula el pago de cada mano y acredita todo de una vez
const finishGame = async (game, { insurancePayout = 0 } = {}) => {
  let total = 0;
  let historic = false;
  game.hands.forEach((h) => {
    h.done = true;
    const { payout, historic: isHistoric } = rules.payoutFor(h);
    h.payout = payout;
    if (isHistoric) historic = true;
    total += h.payout;
  });
  const result = game.hands.length === 1 ? game.hands[0].result : 'split';

  const done = await BlackjackGame.findOneAndUpdate(
    { _id: game._id, status: 'active' },
    {
      $set: {
        status: 'finished',
        result,
        payout: total,
        isHistoricBlackjack: historic,
        hands: game.hands,
        activeHand: game.activeHand,
        dealerCards: game.dealerCards,
        insurance: game.insurance,
        insuranceBet: game.insuranceBet,
        insurancePayout,
      },
    },
    { new: true }
  );
  if (!done) throw sendError(409, 'La partida ya terminó');

  let user;
  const credit = total + insurancePayout;
  if (credit > 0) user = await walletService.creditWin(game.user, credit, 'blackjack', { result, insurancePayout, gameId: game._id });
  return { game: done, user };
};

const dealerPlays = (game) => rules.dealerPlay(game.dealerCards, () => cards.draw(game.shoe, 1)[0]);

// Termina las manos que ya no pueden seguir y pasa a la siguiente; si no quedan, juega el crupier y se paga
const advance = async (game) => {
  const next = game.hands.findIndex((h) => !h.done);
  if (next >= 0) {
    game.activeHand = next;
    game.markModified?.('hands');
    await game.save();
    return { game };
  }
  if (game.hands.some((h) => h.result === null)) dealerPlays(game);
  game.hands.forEach((h) => {
    if (h.result === null) h.result = rules.resolveByScores(h.cards, game.dealerCards);
  });
  return finishGame(game);
};

const respond = async (res, userId, game, outcome) => {
  const user = outcome.user || (await User.findById(userId));
  res.json({ game: view(outcome.game || game), user: publicUser(user) });
};

const findActive = async (req, { allowInsurance = false } = {}) => {
  const game = await BlackjackGame.findOne({ _id: req.params.id, user: req.user._id, status: 'active' });
  if (!game) throw sendError(404, 'No hay una partida activa');
  if (game.insurance === 'offered' && !allowInsurance) throw sendError(409, 'Primero decide si tomas el seguro');
  return ensureHands(game);
};

exports.active = async (req, res, next) => {
  try {
    const game = await BlackjackGame.findOne({ user: req.user._id, status: 'active' });
    res.json({ game: game ? view(game) : null });
  } catch (error) {
    next(error);
  }
};

exports.start = async (req, res, next) => {
  try {
    const existing = await BlackjackGame.findOne({ user: req.user._id, status: 'active' });
    if (existing) return res.json({ game: view(existing), user: publicUser(req.user) });

    const amount = Number(req.body.amount);
    const pairsBet = Number(req.body.pairsBet) || 0;
    const threeBet = Number(req.body.threeBet) || 0;

    // Un solo cobro por todo lo apostado: si no alcanza el saldo, no se cobra nada
    await walletService.placeBet(req.user._id, amount + pairsBet + threeBet, 'blackjack', { amount, pairsBet, threeBet });

    const shoe = cards.buildShoe(6);
    const dealt = cards.draw(shoe, 4);
    const playerCards = [dealt[0], dealt[2]];
    const dealerCards = [dealt[1], dealt[3]];

    const pairsType = pairsBet > 0 ? rules.evaluatePairs(playerCards) : null;
    const pairsPayout = pairsType ? pairsBet * rules.PAIRS_PAYOUT[pairsType] : 0;
    const threeType = threeBet > 0 ? rules.evaluateTwentyOnePlusThree(playerCards, dealerCards[0]) : null;
    const threePayout = threeType ? threeBet * rules.THREE_PAYOUT[threeType] : 0;

    const offerInsurance = dealerCards[0].value === 'ACE';

    const game = await BlackjackGame.create({
      user: req.user._id,
      shoe,
      bet: amount,
      hands: [newHand(playerCards, amount)],
      activeHand: 0,
      dealerCards,
      pairsBet,
      pairsType,
      pairsPayout,
      threeBet,
      threeType,
      threePayout,
      insurance: offerInsurance ? 'offered' : 'none',
    });

    let user = await User.findById(req.user._id);
    const sideWin = pairsPayout + threePayout;
    if (sideWin > 0) user = await walletService.creditWin(req.user._id, sideWin, 'blackjack', { sideBets: { pairsType, threeType } });

    // Si el crupier muestra un As, primero se ofrece el seguro y recién después se revisa si tiene blackjack
    if (!offerInsurance) {
      const pBJ = isBlackjack(playerCards);
      const dBJ = isBlackjack(dealerCards);
      if (pBJ || dBJ) {
        game.hands[0].result = pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'lose';
        return respond(res, req.user._id, game, await finishGame(game));
      }
    }

    res.json({ game: view(game), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.insurance = async (req, res, next) => {
  try {
    const game = await findActive(req, { allowInsurance: true });
    if (game.insurance !== 'offered') throw sendError(409, 'No hay un seguro pendiente');

    const take = req.body.take === true || req.body.take === 'true';
    let insuranceBet = 0;
    if (take) {
      insuranceBet = rules.insuranceCost(game.bet);
      await walletService.placeBet(req.user._id, insuranceBet, 'blackjack', { insurance: true });
    }
    game.insurance = take ? 'taken' : 'declined';
    game.insuranceBet = insuranceBet;

    const dBJ = isBlackjack(game.dealerCards);
    const pBJ = isBlackjack(game.hands[0].cards);
    const insurancePayout = take && dBJ ? insuranceBet * rules.INSURANCE_PAYOUT : 0;

    if (dBJ || pBJ) {
      game.hands[0].result = pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'lose';
      return respond(res, req.user._id, game, await finishGame(game, { insurancePayout }));
    }

    // El crupier no tenía blackjack: el seguro se pierde y la mano sigue
    game.insurancePayout = 0;
    await game.save();
    res.json({ game: view(game), user: publicUser(await User.findById(req.user._id)) });
  } catch (error) {
    next(error);
  }
};

exports.hit = async (req, res, next) => {
  try {
    const game = await findActive(req);
    const hand = activeOf(game);
    if (hand.splitAce) throw sendError(400, 'Los Ases divididos solo reciben una carta');
    hand.cards.push(cards.draw(game.shoe, 1)[0]);
    closeIfOver(hand);
    respond(res, req.user._id, game, await advance(game));
  } catch (error) {
    next(error);
  }
};

exports.stand = async (req, res, next) => {
  try {
    const game = await findActive(req);
    activeOf(game).done = true;
    respond(res, req.user._id, game, await advance(game));
  } catch (error) {
    next(error);
  }
};

exports.double = async (req, res, next) => {
  try {
    const game = await findActive(req);
    const hand = activeOf(game);
    if (hand.cards.length !== 2) throw sendError(400, 'Solo puedes doblar con 2 cartas');
    if (hand.splitAce) throw sendError(400, 'No puedes doblar Ases divididos');

    await walletService.placeBet(req.user._id, hand.bet, 'blackjack', { double: true });
    hand.bet = hand.bet * 2;
    hand.doubled = true;
    hand.cards.push(cards.draw(game.shoe, 1)[0]);
    hand.done = true;
    if (handScore(hand.cards) > 21) hand.result = 'lose';
    respond(res, req.user._id, game, await advance(game));
  } catch (error) {
    next(error);
  }
};

exports.split = async (req, res, next) => {
  try {
    const game = await findActive(req);
    const hand = activeOf(game);
    if (!rules.canSplit(hand, game.hands.length)) throw sendError(400, 'No puedes dividir esta mano');

    // La segunda mano necesita otra apuesta igual a la primera
    await walletService.placeBet(req.user._id, hand.bet, 'blackjack', { split: true });

    const aces = hand.cards[0].value === 'ACE';
    const make = (c) => {
      const h = newHand([c, cards.draw(game.shoe, 1)[0]], hand.bet, { fromSplit: true, splitAce: aces });
      if (aces) h.done = true; // Ases divididos: una sola carta cada uno
      else closeIfOver(h);
      return h;
    };
    const [first, second] = hand.cards;
    game.hands.splice(game.activeHand, 1, make(first), make(second));
    respond(res, req.user._id, game, await advance(game));
  } catch (error) {
    next(error);
  }
};

exports.surrender = async (req, res, next) => {
  try {
    const game = await findActive(req);
    const hand = activeOf(game);
    if (game.hands.length !== 1 || hand.cards.length !== 2) throw sendError(400, 'Solo puedes retirarte con tus 2 primeras cartas');

    // Se devuelve la mitad de la apuesta: la otra mitad queda perdida
    hand.result = 'surrender';
    respond(res, req.user._id, game, await finishGame(game));
  } catch (error) {
    next(error);
  }
};

// Cada acción de un jugador se ejecuta en serie: así un doble clic no cobra dos veces ni abre dos partidas
['start', 'insurance', 'hit', 'stand', 'double', 'split', 'surrender'].forEach((nombre) => {
  const accion = exports[nombre];
  exports[nombre] = (req, res, next) => exclusivo(String(req.user._id), () => accion(req, res, next));
});

exports._view = view; // solo para pruebas
