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
    body('pairsBet').optional().isInt({ min: 0, max: 100000 }).withMessage('La apuesta de Perfect Pairs debe ser un entero válido'),
    body('threeBet').optional().isInt({ min: 0, max: 100000 }).withMessage('La apuesta de 21+3 debe ser un entero válido'),
  ],
  validate,
  c.start
);
router.post('/:id/insurance', [body('take').isBoolean().withMessage('Indica si tomas el seguro (true/false)')], validate, c.insurance);
router.post('/:id/hit', c.hit);
router.post('/:id/stand', c.stand);
router.post('/:id/double', c.double);
router.post('/:id/split', c.split);
router.post('/:id/surrender', c.surrender);

module.exports = router;
