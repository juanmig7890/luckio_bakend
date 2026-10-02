const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { spin, hotNumbers } = require('../controllers/rouletteController');

const validateSelection = (bet) => {
  switch (bet.betType) {
    case 'straight': {
      const n = Number(bet.selection);
      return Number.isInteger(n) && n >= 0 && n <= 36;
    }
    case 'color':
      return ['red', 'black'].includes(bet.selection);
    case 'parity':
      return ['odd', 'even'].includes(bet.selection);
    case 'half':
      return ['low', 'high'].includes(bet.selection);
    case 'dozen':
    case 'column':
      return [1, 2, 3].includes(Number(bet.selection));
    default:
      return false;
  }
};

router.use(protect);

router.get('/hot-numbers', hotNumbers);

router.post(
  '/spin',
  [
    body('bets').isArray({ min: 1, max: 20 }).withMessage('Debes enviar al menos una apuesta (máximo 20 por tirada)'),
    body('bets.*.amount').isInt({ min: 10, max: 100000 }).withMessage('Cada apuesta debe ser un entero entre 10 y 100,000'),
    body('bets.*.betType')
      .isIn(['straight', 'color', 'parity', 'half', 'dozen', 'column'])
      .withMessage('Tipo de apuesta inválido'),
    body('bets').custom((bets) => {
      if (!Array.isArray(bets)) return true; // ya lo valida isArray arriba
      if (bets.some((b) => !validateSelection(b))) {
        throw new Error('Una de las apuestas tiene una selección inválida para su tipo');
      }
      const total = bets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
      if (total > 100000) throw new Error('El total apostado en la tirada no puede superar 100,000');
      return true;
    }),
  ],
  validate,
  spin
);

module.exports = router;
