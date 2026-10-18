const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { register, login, me } = require('../controllers/authController');

router.post(
  '/register',
  [
    body('username').isString().withMessage('El usuario debe ser texto').bail().trim().isLength({ min: 3, max: 20 }).withMessage('El usuario debe tener entre 3 y 20 caracteres'),
    body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
    body('password').isString().withMessage('La contraseña debe ser texto').bail().isLength({ min: 6 }).withMessage('La contraseña debe tener mínimo 6 caracteres'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [body('email').isEmail().withMessage('Correo inválido').normalizeEmail(), body('password').isString().withMessage('La contraseña debe ser texto').bail().notEmpty().withMessage('Falta la contraseña')],
  validate,
  login
);

router.get('/me', protect, me);

module.exports = router;