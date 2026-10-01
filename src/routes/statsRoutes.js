const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { leaderboard } = require('../controllers/statsController');

router.get('/leaderboard', protect, leaderboard);

module.exports = router;
