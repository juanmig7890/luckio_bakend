const walletService = require('../services/walletService');
const rouletteService = require('../services/rouletteService');
const { publicUser } = require('./authController');

exports.spin = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const { betType, selection } = req.body;

    let user = await walletService.placeBet(req.user._id, amount, 'roulette', { betType, selection });
    const result = await rouletteService.play({ amount, betType, selection });

    const totalCredit = result.winAmount + result.laPartage;
    if (totalCredit > 0) {
      user = await walletService.creditWin(req.user._id, totalCredit, 'roulette', {
        number: result.number,
        color: result.color,
        betType,
        selection,
        isHot: result.isHot,
        laPartage: result.laPartage,
      });
    }

    res.json({
      number: result.number,
      color: result.color,
      won: result.won,
      winAmount: result.winAmount,
      laPartage: result.laPartage,
      isHot: result.isHot,
      hotNumbers: result.hotNumbers,
      bet: amount,
      betType,
      selection,
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
