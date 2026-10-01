const mongoose = require('mongoose');

// Documento único (pozo progresivo), compartido entre todos los usuarios de slots
const jackpotSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'slots' },
  amount: { type: Number, required: true, default: 1000 },
  lastWinner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastWinAmount: { type: Number, default: 0 },
  lastWinAt: { type: Date, default: null },
});

module.exports = mongoose.model('Jackpot', jackpotSchema);
