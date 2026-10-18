const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bets: { type: Object, default: {} },
  playerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  bankerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  playerTotal: { type: Number, required: true },
  bankerTotal: { type: Number, required: true },
  winner: { type: String, enum: ['player', 'banker', 'tie'], required: true },
  playerPair: { type: Boolean, default: false },
  bankerPair: { type: Boolean, default: false },
  totalBet: { type: Number, required: true },
  totalWin: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

roundSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('BaccaratRound', roundSchema);
