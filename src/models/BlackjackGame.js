const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deckId: { type: String, required: true },
  bet: { type: Number, required: true },
  playerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  dealerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, enum: ['active', 'finished'], default: 'active' },
  result: { type: String, enum: ['blackjack', 'win', 'push', 'lose', null], default: null },
  payout: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BlackjackGame', gameSchema);