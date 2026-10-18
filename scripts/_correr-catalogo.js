// Uso interno: ejecuta UN catálogo en su propio proceso y escribe los resultados como JSON en una línea marcada.
const path = require('node:path');
const { ejecutar } = require('../tests/soporte/run');

(async () => {
  const catalogo = require(path.resolve(process.argv[2]));
  const resultados = await ejecutar(catalogo);
  process.stdout.write(`\n@@RESULTADOS@@${JSON.stringify(resultados)}\n`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
