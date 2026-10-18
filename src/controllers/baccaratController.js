const BaccaratRound = require('../models/BaccaratRound');
const cards = require('../services/cards');
const rules = require('../services/baccaratRules');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

const BET_KEYS = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];

exports.play = async (req, res, next) => {
  try {
    const bets = {};
    BET_KEYS.forEach((k) => {
      bets[k] = Number(req.body.bets?.[k]) || 0;
    });
    const totalBet = BET_KEYS.reduce((s, k) => s + bets[k], 0);

    let user = await walletService.placeBet(req.user._id, totalBet, 'baccarat', { bets });

    const shoe = cards.buildShoe(8);
    const round = rules.dealRound(() => cards.draw(shoe, 1)[0]);
    const payouts = rules.settle(bets, round);
    const totalWin = BET_KEYS.reduce((s, k) => s + payouts[k], 0);

    await BaccaratRound.create({ user: req.user._id, bets, ...round, totalBet, totalWin });
    if (totalWin > 0) {
      user = await walletService.creditWin(req.user._id, totalWin, 'baccarat', { winner: round.winner, payouts });
    }

    res.json({ ...round, bets, payouts, totalBet, totalWin, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

// Marcador: últimas rondas del jugador (la más reciente primero)
exports.history = async (req, res, next) => {
  try {
    const rounds = await BaccaratRound.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(60)
      .select('winner playerPair bankerPair playerTotal bankerTotal')
      .lean();
    res.json({ rounds });
  } catch (error) {
    next(error);
  }
};
