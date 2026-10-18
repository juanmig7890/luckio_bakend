const notFound = (req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `Ese ${field} ya está registrado` });
  }
  // Mongoose: un id con formato inválido o datos que no pasan el esquema son errores del cliente, no del servidor
  if (err.name === 'CastError') return res.status(400).json({ message: 'Identificador o valor con formato inválido' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };