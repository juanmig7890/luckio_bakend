const Jackpot = require('../models/Jackpot');

const KEY = 'slots';
const SEED = 1000;
const CONTRIBUTION_RATE = 0.01; // 1% de cada apuesta alimenta el pozo

const getOrCreate = () =>
  Jackpot.findOneAndUpdate({ key: KEY }, { $setOnInsert: { key: KEY, amount: SEED } }, { upsert: true, new: true });

const getAmount = async () => (await getOrCreate()).amount;

const contribute = async (betAmount) => {
  const share = Math.max(1, Math.floor(betAmount * CONTRIBUTION_RATE));
  await Jackpot.findOneAndUpdate({ key: KEY }, { $inc: { amount: share } }, { upsert: true });
};

// Atómico: entrega el pozo actual y lo reinicia a la semilla en la misma operación,
// así dos usuarios no pueden "ganar" el mismo pozo en una condición de carrera
const claim = async (userId) => {
  const prev = await Jackpot.findOneAndUpdate(
    { key: KEY },
    { $set: { amount: SEED, lastWinner: userId, lastWinAt: new Date() } },
    { upsert: true, new: false }
  );
  const wonAmount = prev ? prev.amount : SEED;
  await Jackpot.updateOne({ key: KEY }, { $set: { lastWinAmount: wonAmount } });
  return wonAmount;
};

module.exports = { getAmount, contribute, claim };
