const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const c = require('../controllers/blackjackController');

router.use(protect);

router.get('/active', c.active);
router.post(
  '/start',
  [
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
    body('pairsBet')
      .optional()
      .isInt({ min: 0, max: 100000 })
      .withMessage('La apuesta de Perfect Pairs debe ser un entero válido'),
  ],
  validate,
  c.start
);
router.post('/:id/hit', c.hit);
router.post('/:id/stand', c.stand);
router.post('/:id/double', c.double);

module.exports = router;