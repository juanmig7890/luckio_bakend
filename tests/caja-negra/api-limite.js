// CAJA NEGRA · Límite de peticiones (protección contra abuso). Va en su propio archivo para tener un contador limpio.
const { crearEntorno } = require('./entorno');

const casos = [
  { id: 'CN-GEN-06', tecnica: 'VL', modulo: 'API general', regla: 'RN: máximo 600 peticiones por IP cada 15 minutos', objetivo: 'La petición 600 pasa y la 601 es bloqueada con 429', entrada: '601 llamadas seguidas a GET /api/health', esperadoValor: { primeras600: 200, la601: 429 },
    run: async (ctx) => { let ultimaOk = 0; for (let i = 1; i <= 600; i++) ultimaOk = (await ctx.api('GET', '/api/health')).status; const r = await ctx.api('GET', '/api/health'); return { primeras600: ultimaOk, la601: r.status }; } },
];

module.exports = { nombre: 'api-limite', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
