const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { spin, hotNumbers } = require('../controllers/rouletteController');

router.use(protect);

router.get('/hot-numbers', hotNumbers);

router.post(
  '/spin',
  [
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
    body('betType')
      .isIn(['straight', 'color', 'parity', 'half', 'dozen', 'column'])
      .withMessage('Tipo de apuesta inválido'),
    body('selection').custom((value, { req }) => {
      switch (req.body.betType) {
        case 'straight': {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 0 || n > 36) throw new Error('El número debe estar entre 0 y 36');
          return true;
        }
        case 'color':
          if (!['red', 'black'].includes(value)) throw new Error('El color debe ser red o black');
          return true;
        case 'parity':
          if (!['odd', 'even'].includes(value)) throw new Error('La selección debe ser odd o even');
          return true;
        case 'half':
          if (!['low', 'high'].includes(value)) throw new Error('La selección debe ser low o high');
          return true;
        case 'dozen':
        case 'column':
          if (![1, 2, 3].includes(Number(value))) throw new Error('La selección debe ser 1, 2 o 3');
          return true;
        default:
          return true;
      }
    }),
  ],
  validate,
  spin
);

module.exports = router;
