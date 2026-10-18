// CAJA NEGRA · Plinko a través de la API (el azar se fija con valores 0/1 para conocer la casilla de caída)
const { crearEntorno } = require('./entorno');

const pk = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Plinko', regla, objetivo, entrada, esperadoValor, run });
const soltar = (ctx, token, amount, risk) => ctx.api('POST', '/api/plinko/drop', { token, body: { amount, risk } });
const con = async (ctx, pasos, saldo, amount, risk) => { const u = await ctx.usuario({ balance: saldo }); ctx.sorteo(pasos); const r = await soltar(ctx, u.token, amount, risk); ctx.sorteoReal(); return { r, u }; };
const TODO_IZQ = Array(12).fill(0);
const TODO_DER = Array(12).fill(1);
const CENTRO = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]; // 6 derechas → casilla 6

const casos = [
  pk('CN-PLK-01', 'EP', 'RN: riesgo = low, medium o high', 'Riesgo inexistente', 'risk="extremo"', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await soltar(ctx, u.token, 100, 'extremo')).status }; }),
  pk('CN-PLK-02', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuestas de 9 y de 100,001 (fuera de rango)', 'amount=9 | amount=100001', { statuses: [400, 400] },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); return { statuses: [(await soltar(ctx, u.token, 9, 'low')).status, (await soltar(ctx, u.token, 100001, 'low')).status] }; }),
  pk('CN-PLK-03', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuestas de 10 y de 100,000 (límites exactos)', 'amount=10 | amount=100000', { statuses: [200, 200] },
    async (ctx) => { const a = await con(ctx, CENTRO, 1000, 10, 'low'); const b = await con(ctx, CENTRO, 200000, 100000, 'low'); return { statuses: [a.r.status, b.r.status] }; }),
  pk('CN-PLK-04', 'VL', 'RN: la bola cae en una de 13 casillas (0 a 12); todo a la izquierda es la casilla 0', 'Todo a la izquierda en riesgo bajo: casilla 0, paga ×5.6', '12 pasos a la izquierda, apuesta 100', { casilla: 0, multiplicador: 5.6, premio: 560, saldo: 10460 },
    async (ctx) => { const { r, u } = await con(ctx, TODO_IZQ, 10000, 100, 'low'); return { casilla: r.body.slot, multiplicador: r.body.multiplier, premio: r.body.winAmount, saldo: ctx.saldo(u.id) }; }),
  pk('CN-PLK-05', 'VL', 'RN: la tabla es simétrica (izquierda y derecha pagan igual)', 'Todo a la derecha en riesgo bajo: casilla 12, mismo premio que la 0', '12 pasos a la derecha, apuesta 100', { casilla: 12, multiplicador: 5.6, premio: 560 },
    async (ctx) => { const { r } = await con(ctx, TODO_DER, 10000, 100, 'low'); return { casilla: r.body.slot, multiplicador: r.body.multiplier, premio: r.body.winAmount }; }),
  pk('CN-PLK-06', 'EP', 'RN: el centro es lo más probable y paga menos', 'Casilla central (6) en riesgo bajo paga ×0.6 (pierde parte de la apuesta)', '6 derechas y 6 izquierdas, apuesta 100', { casilla: 6, multiplicador: 0.6, premio: 60, saldo: 9960 },
    async (ctx) => { const { r, u } = await con(ctx, CENTRO, 10000, 100, 'low'); return { casilla: r.body.slot, multiplicador: r.body.multiplier, premio: r.body.winAmount, saldo: ctx.saldo(u.id) }; }),
  pk('CN-PLK-07', 'TD', 'RN: más riesgo = premios extremos más altos', 'Riesgo alto, caída en el borde: ×250', 'high, todo a la izquierda, apuesta 100', { multiplicador: 250, premio: 25000 },
    async (ctx) => { const { r } = await con(ctx, TODO_IZQ, 10000, 100, 'high'); return { multiplicador: r.body.multiplier, premio: r.body.winAmount }; }),
  pk('CN-PLK-08', 'TD', 'Tabla: saldo menor que la apuesta → rechaza', 'Saldo 50 y apuesta 100', 'saldo=50', { status: 400, saldo: 50 },
    async (ctx) => { const u = await ctx.usuario({ balance: 50 }); const r = await soltar(ctx, u.token, 100, 'low'); return { status: r.status, saldo: ctx.saldo(u.id) }; }),
  pk('CN-PLK-09', 'EP', 'RN: /config publica 12 filas y las 3 tablas de 13 premios', 'Configuración visible para el cliente', 'GET /api/plinko/config', { filas: 12, tablas: { low: 13, medium: 13, high: 13 } },
    async (ctx) => { const u = await ctx.usuario(); const r = await ctx.api('GET', '/api/plinko/config', { token: u.token }); return { filas: r.body.rows, tablas: { low: r.body.multipliers.low.length, medium: r.body.multipliers.medium.length, high: r.body.multipliers.high.length } }; }),
  pk('CN-PLK-10', 'TE', 'RN: jugar exige sesión', 'Soltar bola sin token', 'POST /api/plinko/drop sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/plinko/drop', { body: { amount: 10, risk: 'low' } })).status })),
];

module.exports = { nombre: 'api-plinko', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
