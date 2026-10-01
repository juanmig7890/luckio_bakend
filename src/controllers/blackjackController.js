const BlackjackGame = require('../models/BlackjackGame');
const User = require('../models/User');
const deck = require('../services/deckService');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

const BACK = 'https://deckofcardsapi.com/static/img/back.png';

const cardValue = (v) => {
  if (v === 'ACE') return 11;
  if (['KING', 'QUEEN', 'JACK'].includes(v)) return 10;
  return Number(v);
};

const handScore = (cards) => {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.value);
    if (c.value === 'ACE') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

const isBlackjack = (cards) => cards.length === 2 && handScore(cards) === 21;

// Apuesta lateral "Perfect Pairs": paga según qué tan parecido es el par de cartas inicial
const SUIT_COLOR = { SPADES: 'black', CLUBS: 'black', HEARTS: 'red', DIAMONDS: 'red' };
const PAIRS_PAYOUT = { perfect: 25, colored: 12, mixed: 6 };

const evaluatePairs = ([c1, c2]) => {
  if (!c1 || !c2 || c1.value !== c2.value) return null;
  if (c1.suit === c2.suit) return 'perfect';
  if (SUIT_COLOR[c1.suit] === SUIT_COLOR[c2.suit]) return 'colored';
  return 'mixed';
};

// El nombre "Blackjack" nace de un bono real de casinos de Nevada (s. XX):
// pagaban extra si la mano natural era As de Picas + Jota negra (Picas o Tréboles, las "black jacks")
const isHistoricBlackjack = (cards) =>
  cards.length === 2 && cards.some((c) => c.code === 'AS') && cards.some((c) => c.code === 'JS' || c.code === 'JC');

const view = (game) => {
  const active = game.status === 'active';
  const dealerCards = active ? [game.dealerCards[0], { hidden: true, image: BACK }] : game.dealerCards;
  return {
    id: game._id,
    bet: game.bet,
    pairsBet: game.pairsBet,
    pairsType: game.pairsType,
    pairsPayout: game.pairsPayout,
    isHistoricBlackjack: game.isHistoricBlackjack,
    status: game.status,
    result: game.result,
    payout: game.payout,
    playerCards: game.playerCards,
    dealerCards,
    playerScore: handScore(game.playerCards),
    dealerScore: active ? handScore([game.dealerCards[0]]) : handScore(game.dealerCards),
    canDouble: active && game.playerCards.length === 2,
  };
};

const finish = async (game, result) => {
  const payouts = {
    blackjack: Math.floor(game.bet * 2.5),
    win: game.bet * 2,
    push: game.bet,
    lose: 0,
  };
  let payout = payouts[result];

  // El bono histórico reemplaza el pago normal de blackjack (así se pagaba originalmente)
  const historic = result === 'blackjack' && isHistoricBlackjack(game.playerCards);
  if (historic) payout = game.bet * 10;

  const done = await BlackjackGame.findOneAndUpdate(
    { _id: game._id, status: 'active' },
    {
      $set: {
        status: 'finished',
        result,
        payout,
        isHistoricBlackjack: historic,
        bet: game.bet,
        playerCards: game.playerCards,
        dealerCards: game.dealerCards,
      },
    },
    { new: true }
  );
  if (!done) {
    const err = new Error('La partida ya terminó');
    err.status = 409;
    throw err;
  }
  let user;
  if (payout > 0) user = await walletService.creditWin(game.user, payout, 'blackjack', { result, gameId: game._id });
  return { game: done, user };
};

const dealerPlays = async (game) => {
  while (handScore(game.dealerCards) < 17) {
    const [card] = await deck.draw(game.deckId, 1);
    game.dealerCards.push(card);
  }
};

const resolveByScores = (game) => {
  const p = handScore(game.playerCards);
  const d = handScore(game.dealerCards);
  if (d > 21 || p > d) return 'win';
  if (p === d) return 'push';
  return 'lose';
};

const respond = async (res, userId, game, finished) => {
  const user = finished.user || (await User.findById(userId));
  res.json({ game: view(finished.game || game), user: publicUser(user) });
};

const findActive = async (req) => {
  const game = await BlackjackGame.findOne({ _id: req.params.id, user: req.user._id, status: 'active' });
  if (!game) {
    const err = new Error('No hay una partida activa');
    err.status = 404;
    throw err;
  }
  return game;
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

    await walletService.placeBet(req.user._id, amount, 'blackjack');
    if (pairsBet > 0) await walletService.placeBet(req.user._id, pairsBet, 'blackjack', { sideBet: 'pairs' });

    let deckId, cards;
    try {
      deckId = await deck.newDeck();
      cards = await deck.draw(deckId, 4);
    } catch (err) {
      await walletService.creditWin(req.user._id, amount + pairsBet, 'blackjack', { refund: true });
      throw err;
    }

    const playerCards = [cards[0], cards[2]];
    const dealerCards = [cards[1], cards[3]];

    const pairsType = pairsBet > 0 ? evaluatePairs(playerCards) : null;
    const pairsPayout = pairsType ? pairsBet * PAIRS_PAYOUT[pairsType] : 0;

    const game = await BlackjackGame.create({
      user: req.user._id,
      deckId,
      bet: amount,
      playerCards,
      dealerCards,
      pairsBet,
      pairsType,
      pairsPayout,
    });

    let user = await User.findById(req.user._id);
    if (pairsPayout > 0) {
      user = await walletService.creditWin(req.user._id, pairsPayout, 'blackjack', { sideBet: 'pairs', pairsType });
    }

    const pBJ = isBlackjack(game.playerCards);
    const dBJ = isBlackjack(game.dealerCards);
    if (pBJ || dBJ) {
      const result = pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'lose';
      const finished = await finish(game, result);
      return respond(res, req.user._id, game, finished);
    }

    res.json({ game: view(game), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.hit = async (req, res, next) => {
  try {
    const game = await findActive(req);
    const [card] = await deck.draw(game.deckId, 1);
    game.playerCards.push(card);
    const score = handScore(game.playerCards);

    if (score > 21) return respond(res, req.user._id, game, await finish(game, 'lose'));
    if (score === 21) {
      await dealerPlays(game);
      return respond(res, req.user._id, game, await finish(game, resolveByScores(game)));
    }

    await game.save();
    res.json({ game: view(game), user: publicUser(await User.findById(req.user._id)) });
  } catch (error) {
    next(error);
  }
};

exports.stand = async (req, res, next) => {
  try {
    const game = await findActive(req);
    await dealerPlays(game);
    respond(res, req.user._id, game, await finish(game, resolveByScores(game)));
  } catch (error) {
    next(error);
  }
};

exports.double = async (req, res, next) => {
  try {
    const game = await findActive(req);
    if (game.playerCards.length !== 2) {
      return res.status(400).json({ message: 'Solo puedes doblar con tus 2 primeras cartas' });
    }
    await walletService.placeBet(req.user._id, game.bet, 'blackjack', { double: true });
    game.bet = game.bet * 2;

    const [card] = await deck.draw(game.deckId, 1);
    game.playerCards.push(card);

    if (handScore(game.playerCards) > 21) return respond(res, req.user._id, game, await finish(game, 'lose'));
    await dealerPlays(game);
    respond(res, req.user._id, game, await finish(game, resolveByScores(game)));
  } catch (error) {
    next(error);
  }
};