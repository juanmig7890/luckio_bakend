const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

exports.recharge = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const user = await walletService.recharge(req.user._id, amount);
    res.json({ message: `Recargaste ${amount} fichas`, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.history = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
};