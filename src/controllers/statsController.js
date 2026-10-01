const User = require('../models/User');
const Transaction = require('../models/Transaction');

exports.leaderboard = async (req, res, next) => {
  try {
    const topWagered = await User.find().sort({ totalWagered: -1 }).limit(10).select('username totalWagered vipLevel');

    const topWins = await Transaction.aggregate([
      { $match: { type: 'win' } },
      { $sort: { amount: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, amount: 1, game: 1, createdAt: 1, username: '$user.username' } },
    ]);

    res.json({ topWagered, topWins });
  } catch (error) {
    next(error);
  }
};
