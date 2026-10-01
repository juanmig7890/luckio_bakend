const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['recharge', 'bet', 'win'], required: true },
  game: { type: String, enum: ['blackjack', 'slots', 'roulette', 'sports', 'wallet'], default: 'wallet' },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transaction', transactionSchema);