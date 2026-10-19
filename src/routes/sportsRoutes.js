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
    body('market').optional().isIn(['h2h', 'totals']).withMessage('Mercado inválido'),
    body('pick').notEmpty().withMessage('Falta tu selección'),
    body('point').optional().isFloat().withMessage('La línea de goles debe ser un número'),
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
  ],
  validate,
  c.placeBet
);
router.post(
  '/parlay',
  [
    body('legs').isArray({ min: 2, max: 10 }).withMessage('Una combinada necesita entre 2 y 10 selecciones'),
    body('legs.*.eventId').notEmpty().withMessage('Falta el evento de alguna selección'),
    body('legs.*.market').optional().isIn(['h2h', 'totals']).withMessage('Mercado inválido'),
    body('legs.*.pick').notEmpty().withMessage('Falta la selección de algún partido'),
    body('legs.*.point').optional().isFloat().withMessage('La línea de goles debe ser un número'),
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
  ],
  validate,
  c.placeParlay
);

module.exports = router;
