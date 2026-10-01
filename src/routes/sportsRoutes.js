const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const c = require('../controllers/sportsController');

router.use(protect);

router.get('/events', c.events);
router.get('/bets', c.myBets);
router.post('/settle', c.settle);
router.post(
  '/bet',
  [
    body('eventId').notEmpty().withMessage('Falta el evento'),
    body('pick').notEmpty().withMessage('Falta tu selección'),
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
  ],
  validate,
  c.placeBet
);

module.exports = router;