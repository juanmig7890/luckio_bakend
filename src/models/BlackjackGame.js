const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deckId: { type: String, required: true },
  bet: { type: Number, required: true },
  playerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  dealerCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, enum: ['active', 'finished'], default: 'active' },
  result: { type: String, enum: ['blackjack', 'win', 'push', 'lose', 'surrender', null], default: null },
  payout: { type: Number, default: 0 },
  // Apuesta lateral "Perfect Pairs": se resuelve con las primeras 2 cartas del jugador
  pairsBet: { type: Number, default: 0 },
  pairsType: { type: String, enum: ['perfect', 'colored', 'mixed', null], default: null },
  pairsPayout: { type: Number, default: 0 },
  // Bono histórico: As de Picas + Jota negra (origen real del nombre "Blackjack")
  isHistoricBlackjack: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BlackjackGame', gameSchema);