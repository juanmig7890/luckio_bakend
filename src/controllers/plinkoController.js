const walletService = require('../services/walletService');
const plinko = require('../services/plinkoService');
const { publicUser } = require('./authController');

exports.config = (req, res) => {
  res.json({ rows: plinko.ROWS, multipliers: plinko.MULTIPLIERS });
};

exports.drop = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const risk = req.body.risk;

    let user = await walletService.placeBet(req.user._id, amount, 'plinko', { risk });
    const result = plinko.play(risk, amount);

    if (result.winAmount > 0) {
      user = await walletService.creditWin(req.user._id, result.winAmount, 'plinko', {
        risk,
        slot: result.slot,
        multiplier: result.multiplier,
      });
    }

    res.json({ ...result, risk, bet: amount, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};
