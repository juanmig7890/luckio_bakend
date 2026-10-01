const crypto = require('crypto');

const randomInt = (max) => crypto.randomInt(0, max);

const weightedPick = (items) => {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = crypto.randomInt(0, total);
  for (const item of items) {
    if (r < item.w) return item;
    r -= item.w;
  }
  return items[items.length - 1];
};

module.exports = { randomInt, weightedPick };