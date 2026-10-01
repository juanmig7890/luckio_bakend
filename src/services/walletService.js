const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { calculateVipLevel } = require('../utils/vip');

const syncVip = async (user) => {
  const level = calculateVipLevel(user.totalWagered);
  if (level !== user.vipLevel) {
    user.vipLevel = level;
    await user.save({ validateBeforeSave: false });
  }
  return user;
};

// Descuenta una apuesta y suma al total apostado
const placeBet = async (userId, amount, game, meta = {}) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount, totalWagered: amount } },
    { new: true }
  );
  if (!user) {
    const err = new Error('Saldo insuficiente');
    err.status = 400;
    throw err;
  }
  await Transaction.create({ user: userId, type: 'bet', game, amount: -amount, balanceAfter: user.balance, meta });
  return syncVip(user);
};

// Acredita un premio
const creditWin = async (userId, amount, game, meta = {}) => {
  if (amount <= 0) return User.findById(userId);
  const user = await User.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true });
  await Transaction.create({ user: userId, type: 'win', game, amount, balanceAfter: user.balance, meta });
  return user;
};

// Recarga simulada
const recharge = async (userId, amount) => {
  const user = await User.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true });
  await Transaction.create({ user: userId, type: 'recharge', game: 'wallet', amount, balanceAfter: user.balance });
  return user;
};

module.exports = { placeBet, creditWin, recharge };