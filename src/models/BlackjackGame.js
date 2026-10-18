const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Cartas que quedan por salir (códigos "AS", "0H"...). Mazo propio, ya no se usa una API externa.
  shoe: { type: [String], default: [] },
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
  // Apuesta lateral "21+3": tus 2 cartas + la carta visible del crupier
  threeBet: { type: Number, default: 0 },
  threeType: { type: String, enum: ['suitedTrips', 'straightFlush', 'threeKind', 'straight', 'flush', null], default: null },
  threePayout: { type: Number, default: 0 },
  // Seguro: se ofrece cuando la carta visible del crupier es un As
  insurance: { type: String, enum: ['none', 'offered', 'taken', 'declined'], default: 'none' },
  insuranceBet: { type: Number, default: 0 },
  insurancePayout: { type: Number, default: 0 },
  // Bono histórico: As de Picas + Jota negra (origen real del nombre "Blackjack")
  isHistoricBlackjack: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BlackjackGame', gameSchema);
