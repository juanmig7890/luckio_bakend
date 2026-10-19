const mongoose = require('mongoose');

// Una "pata" (selección) de la combinada: se guarda ya resuelta contra los eventos reales (igual que en
// una apuesta sencilla), nunca lo que mande el cliente directamente.
const legSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    sportKey: { type: String, required: true },
    sportTitle: String,
    homeTeam: String,
    awayTeam: String,
    commenceTime: Date,
    market: { type: String, enum: ['h2h', 'totals'], default: 'h2h' },
    point: Number,
    pick: { type: String, required: true },
    odds: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'won', 'lost', 'push'], default: 'pending' },
  },
  { _id: false }
);

const parlayBetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  legs: { type: [legSchema], required: true },
  combinedOdds: { type: Number, required: true },
  amount: { type: Number, required: true },
  potentialWin: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'won', 'lost'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  settledAt: Date,
});

module.exports = mongoose.model('ParlayBet', parlayBetSchema);
