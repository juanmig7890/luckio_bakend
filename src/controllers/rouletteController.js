const walletService = require('../services/walletService');
const slotsService = require('../services/slotsService');
const { publicUser } = require('./authController');

exports.spin = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    let user = await walletService.placeBet(req.user._id, amount, 'slots');
    const result = slotsService.spin(amount);
    if (result.winAmount > 0) {
      user = await walletService.creditWin(req.user._id, result.winAmount, 'slots', { grid: result.grid });
    }
    res.json({ ...result, bet: amount, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};