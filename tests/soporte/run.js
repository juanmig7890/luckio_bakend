// Utilidades comunes para los catálogos de casos de prueba.
// Un "caso" es un objeto con sus datos de diseño (id, objetivo, entrada, esperado...) y una función run()
// que ejecuta el código real y devuelve lo que se observó. Así el MISMO catálogo sirve para:
//   1) correr con `node --test` (registrar), y
//   2) generar la evidencia (ejecutar) con lo realmente obtenido, que alimenta el Excel y el documento.
const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');

const fmt = (v) => util.inspect(v, { breakLength: Infinity, depth: 6, compact: true });

const meta = (caso) => {
  const { run, esperadoValor, ...rest } = caso;
  return { ...rest, esperado: caso.esperado ?? fmt(esperadoValor) };
};

const ejecutarCaso = async (caso, ctx) => {
  const t0 = process.hrtime.bigint();
  let obtenido;
  let estado = 'PASÓ';
  let detalle = '';
  try {
    obtenido = await caso.run(ctx);
    assert.deepStrictEqual(obtenido, caso.esperadoValor);
  } catch (e) {
    estado = 'FALLÓ';
    detalle = String(e && e.message ? e.message : e).split('\n')[0];
    if (obtenido === undefined && !(e instanceof assert.AssertionError)) obtenido = `EXCEPCIÓN: ${detalle}`;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ...meta(caso), obtenido: typeof obtenido === 'string' && obtenido.startsWith('EXCEPCIÓN') ? obtenido : fmt(obtenido), estado, detalle, ms: Math.round(ms * 100) / 100 };
};

// Registra cada caso como una prueba de node:test
const registrar = (catalogo) => {
  let ctx;
  if (catalogo.setup) test.before(async () => { ctx = await catalogo.setup(); });
  if (catalogo.teardown) test.after(async () => { await catalogo.teardown(ctx); });
  for (const caso of catalogo.casos) {
    test(`${caso.id} ${caso.objetivo}`, async () => {
      const obtenido = await caso.run(ctx);
      assert.deepStrictEqual(obtenido, caso.esperadoValor);
    });
  }
};

// Ejecuta todos los casos y devuelve la lista de resultados (para evidencias)
const ejecutar = async (catalogo) => {
  const ctx = catalogo.setup ? await catalogo.setup() : undefined;
  const out = [];
  for (const caso of catalogo.casos) out.push(await ejecutarCaso(caso, ctx));
  if (catalogo.teardown) await catalogo.teardown(ctx);
  return out;
};

module.exports = { registrar, ejecutar, fmt };
