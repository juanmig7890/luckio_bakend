const express = require('express');
const router = express.Router();

// ✅ Usar '../' para salir de routes/ e entrar a controllers/ y middleware/
const slotsController = require('../controllers/slotsController');
const authMiddleware = require('../middleware/authMiddleware'); // Ajusta el nombre exacto de tu middleware

// Definición de la ruta
router.post('/spin', authMiddleware, slotsController.spin);

module.exports = router;