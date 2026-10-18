const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { RISKS } = require('../services/plinkoService');
const { drop, config } = require('../controllers/plinkoController');

router.use(protect);

router.get('/config', config);
router.post(
  '/drop',
  [
    body('amount').isInt({ min: 10, max: 100000 }).withMessage('La apuesta debe ser un entero entre 10 y 100,000'),
    body('risk').isIn(RISKS).withMessage('El riesgo debe ser low, medium o high'),
  ],
  validate,
  drop
);

module.exports = router;
