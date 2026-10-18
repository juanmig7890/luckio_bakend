const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { play, history } = require('../controllers/baccaratController');

const KEYS = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];

router.use(protect);

router.get('/history', history);
router.post(
  '/play',
  [
    body('bets').isObject().withMessage('Debes enviar tus apuestas'),
    body('bets').custom((bets) => {
      const values = KEYS.map((k) => Number(bets?.[k] ?? 0));
      if (values.some((v) => !Number.isInteger(v) || v < 0)) throw new Error('Cada apuesta debe ser un entero positivo');
      if (values.some((v) => v > 0 && v < 10)) throw new Error('La apuesta mínima por casilla es 10');
      const total = values.reduce((s, v) => s + v, 0);
      if (total <= 0) throw new Error('Apuesta en al menos una casilla');
      if (total > 100000) throw new Error('El total apostado no puede superar 100,000');
      return true;
    }),
  ],
  validate,
  play
);

module.exports = router;
