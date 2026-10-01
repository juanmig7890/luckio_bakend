const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { recharge, history } = require('../controllers/walletController');

router.post(
  '/recharge',
  protect,
  [body('amount').isInt({ min: 100, max: 100000 }).withMessage('El monto debe ser un entero entre 100 y 100,000')],
  validate,
  recharge
);

router.get('/transactions', protect, history);

module.exports = router;