const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { spin } = require('../controllers/rouletteController');

router.post(
  '/spin',
  protect,
  [body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000')],
  validate,
  spin
);

module.exports = router;