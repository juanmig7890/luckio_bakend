const BlackjackGame = require('../models/BlackjackGame');
const User = require('../models/User');
const cards = require('../services/cards');
const rules = require('../services/blackjackRules');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

const { handScore, isBlackjack } = rules;

const sendError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// Lo que ve el cliente: nunca se envía la carta oculta del crupier ni el mazo mientras la mano está activa
const view = (game) => {
  const active = game.status === 'active';
  const dealerCards = active ? [game.dealerCards[0], { hidden: true }] : game.dealerCards;
  const deciding = active && game.insurance === 'offered';
  return {
    id: game._id,
    bet: game.bet,
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
    playerCards: game.playerCards,
    dealerCards,
    playerScore: handScore(game.playerCards),
    dealerScore: active ? handScore([game.dealerCards[0]]) : handScore(game.dealerCards),
    canInsure: deciding,
    canHit: active && !deciding,
    canDouble: active && !deciding && game.playerCards.length === 2,
    canSurrender: active && !deciding && game.playerCards.length === 2,
  };
};

const finish = async (game, result, { insurancePayout = 0 } = {}) => {
  let payout = rules.mainPayout(result, game.bet);

  // El bono histórico reemplaza el pago normal de blackjack (así se pagaba originalmente)
  const historic = result === 'blackjack' && rules.isHistoricBlackjack(game.playerCards);
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
        insurance: game.insurance,
        insuranceBet: game.insuranceBet,
        insurancePayout,
      },
    },
    { new: true }
  );
  if (!done) throw sendError(409, 'La partida ya terminó');

  let user;
  const credit = payout + insurancePayout;
  if (credit > 0) user = await walletService.creditWin(game.user, credit, 'blackjack', { result, insurancePayout, gameId: game._id });
  return { game: done, user };
};

const dealerPlays = (game) => rules.dealerPlay(game.dealerCards, () => cards.draw(game.shoe, 1)[0]);

const respond = async (res, userId, game, finished) => {
  const user = finished.user || (await User.findById(userId));
  res.json({ game: view(finished.game || game), user: publicUser(user) });
};

const findActive = async (req, { allowInsurance = false } = {}) => {
  const game = await BlackjackGame.findOne({ _id: req.params.id, user: req.user._id, status: 'active' });
  if (!game) throw sendError(404, 'No hay una partida activa');
  if (game.insurance === 'offered' && !allowInsurance) throw sendError(409, 'Primero decide si tomas el seguro');
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
      playerCards,
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
      const pBJ = isBlackjack(game.playerCards);
      const dBJ = isBlackjack(game.dealerCards);
      if (pBJ || dBJ) {
        const result = pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'lose';
        return respond(res, req.user._id, game, await finish(game, result));
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
    const pBJ = isBlackjack(game.playerCards);
    const insurancePayout = take && dBJ ? insuranceBet * rules.INSURANCE_PAYOUT : 0;

    if (dBJ || pBJ) {
      const result = pBJ && dBJ ? 'push' : pBJ ? 'blackjack' : 'lose';
      return respond(res, req.user._id, game, await finish(game, result, { insurancePayout }));
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
    game.playerCards.push(cards.draw(game.shoe, 1)[0]);
    const score = handScore(game.playerCards);

    if (score > 21) return respond(res, req.user._id, game, await finish(game, 'lose'));
    if (score === 21) {
      dealerPlays(game);
      return respond(res, req.user._id, game, await finish(game, rules.resolveByScores(game.playerCards, game.dealerCards)));
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
    dealerPlays(game);
    respond(res, req.user._id, game, await finish(game, rules.resolveByScores(game.playerCards, game.dealerCards)));
  } catch (error) {
    next(error);
  }
};

exports.double = async (req, res, next) => {
  try {
    const game = await findActive(req);
    if (game.playerCards.length !== 2) throw sendError(400, 'Solo puedes doblar con tus 2 primeras cartas');

    await walletService.placeBet(req.user._id, game.bet, 'blackjack', { double: true });
    game.bet = game.bet * 2;
    game.playerCards.push(cards.draw(game.shoe, 1)[0]);

    if (handScore(game.playerCards) > 21) return respond(res, req.user._id, game, await finish(game, 'lose'));
    dealerPlays(game);
    respond(res, req.user._id, game, await finish(game, rules.resolveByScores(game.playerCards, game.dealerCards)));
  } catch (error) {
    next(error);
  }
};

exports.surrender = async (req, res, next) => {
  try {
    const game = await findActive(req);
    if (game.playerCards.length !== 2) throw sendError(400, 'Solo puedes retirarte con tus 2 primeras cartas');

    // Se devuelve la mitad de la apuesta: la otra mitad queda perdida
    const payout = Math.floor(game.bet / 2);
    const done = await BlackjackGame.findOneAndUpdate(
      { _id: game._id, status: 'active' },
      { $set: { status: 'finished', result: 'surrender', payout } },
      { new: true }
    );
    if (!done) throw sendError(409, 'La partida ya terminó');

    const user = await walletService.creditWin(req.user._id, payout, 'blackjack', { result: 'surrender', gameId: game._id });
    res.json({ game: view(done), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports._view = view; // solo para pruebas
