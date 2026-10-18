// Ejecuta las tareas de una misma clave (por ejemplo, un jugador) de una en una.
// Evita condiciones de carrera: con un doble clic llegan dos peticiones casi juntas y, sin esto, las dos leen
// el mismo estado de la partida y cobran dos veces. Sirve para UNA instancia del servidor (Render gratis usa una);
// con varias instancias haría falta además control de versión en la base de datos.
const colas = new Map();

const exclusivo = (clave, tarea) => {
  const previa = colas.get(clave) || Promise.resolve();
  const actual = previa.then(tarea);
  const cola = actual.catch(() => {});
  colas.set(clave, cola);
  cola.then(() => { if (colas.get(clave) === cola) colas.delete(clave); });
  return actual;
};

module.exports = { exclusivo };
