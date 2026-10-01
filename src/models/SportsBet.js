const mongoose = require('mongoose');

const sportsBetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventId: { type: String, required: true },
  sportKey: { type: String, required: true },
  sportTitle: String,
  homeTeam: String,
  awayTeam: String,
  commenceTime: Date,
  pick: { type: String, required: true },
  odds: { type: Number, required: true },
  amount: { type: Number, required: true },
  potentialWin: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'won', 'lost'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  settledAt: Date,
});

module.exports = mongoose.model('SportsBet', sportsBetSchema);