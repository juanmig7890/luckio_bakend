const mongoose = require('mongoose');

// Historial global de la ruleta (es una sola mesa compartida), usado para calcular números calientes
const rouletteSpinSchema = new mongoose.Schema({
  number: { type: Number, required: true, min: 0, max: 36 },
  color: { type: String, enum: ['red', 'black', 'green'], required: true },
  createdAt: { type: Date, default: Date.now },
});

rouletteSpinSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RouletteSpin', rouletteSpinSchema);
