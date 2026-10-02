const walletService = require('../services/walletService');
const rouletteService = require('../services/rouletteService');
const { publicUser } = require('./authController');

exports.spin = async (req, res, next) => {
  try {
    const bets = req.body.bets.map((b) => ({ betType: b.betType, selection: b.selection, amount: Number(b.amount) }));
    const totalAmount = bets.reduce((sum, b) => sum + b.amount, 0);

    let user = await walletService.placeBet(req.user._id, totalAmount, 'roulette', { bets });
    const result = await rouletteService.play(bets);

    if (result.totalWin > 0) {
      user = await walletService.creditWin(req.user._id, result.totalWin, 'roulette', {
        number: result.number,
        color: result.color,
        results: result.results,
      });
    }

    res.json({
      number: result.number,
      color: result.color,
      results: result.results,
      totalWin: result.totalWin,
      totalBet: totalAmount,
      hotNumbers: result.hotNumbers,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.hotNumbers = async (req, res, next) => {
  try {
    const hotNumbers = await rouletteService.getHotNumbers();
    res.json({ hotNumbers });
  } catch (error) {
    next(error);
  }
};
