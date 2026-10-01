const walletService = require('../services/walletService');
const slotsService = require('../services/slotsService');
const jackpotService = require('../services/jackpotService');
const { publicUser } = require('./authController');

exports.spin = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    let user = await walletService.placeBet(req.user._id, amount, 'slots');
    const result = slotsService.spin(amount);

    let jackpotWon = 0;
    if (result.jackpotWin) {
      jackpotWon = await jackpotService.claim(req.user._id);
    } else {
      await jackpotService.contribute(amount);
    }

    const totalWin = result.winAmount + jackpotWon;
    if (totalWin > 0) {
      user = await walletService.creditWin(req.user._id, totalWin, 'slots', { grid: result.grid, jackpotWon });
    }

    res.json({ ...result, jackpotWon, bet: amount, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.jackpot = async (req, res, next) => {
  try {
    const amount = await jackpotService.getAmount();
    res.json({ amount });
  } catch (error) {
    next(error);
  }
};
