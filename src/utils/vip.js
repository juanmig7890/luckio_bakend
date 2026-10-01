const calculateVipLevel = (totalWagered) => {
  if (totalWagered >= 50000) return 'VIP LUCK.IO';
  if (totalWagered >= 20000) return 'Oro';
  if (totalWagered >= 5000) return 'Plata';
  return 'Bronce';
};

module.exports = { calculateVipLevel };