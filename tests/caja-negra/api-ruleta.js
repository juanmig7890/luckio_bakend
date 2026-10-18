// CAJA NEGRA · Ruleta europea (una tirada con varias apuestas) a través de la API
const { crearEntorno } = require('./entorno');

const rl = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Ruleta', regla, objetivo, entrada, esperadoValor, run });
const girar = (ctx, token, bets) => ctx.api('POST', '/api/roulette/spin', { token, body: { bets } });
const bet = (betType, selection, amount) => ({ betType, selection, amount });
const vacia = (ctx) => { ctx.db.spins.length = 0; };
// Juega una tirada con el número forzado y devuelve { total, saldo }
const jugar = async (ctx, saldo, apuestas, numero) => {
  vacia(ctx);
  const u = await ctx.usuario({ balance: saldo });
  ctx.sorteo(numero);
  const r = await girar(ctx, u.token, apuestas);
  ctx.sorteoReal();
  return { r, u };
};

const casos = [
  // ── Cantidad de apuestas por tirada: 1 a 20 ──
  rl('CN-RL-01', 'VL', 'RN: entre 1 y 20 apuestas por tirada', 'Cero apuestas (debajo del mínimo)', 'bets=[]', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await girar(ctx, u.token, [])).status }; }),
  rl('CN-RL-02', 'VL', 'RN: entre 1 y 20 apuestas por tirada', 'Una sola apuesta (mínimo exacto)', '1 apuesta de 10 al rojo', { status: 200 },
    async (ctx) => { const { r } = await jugar(ctx, 1000, [bet('color', 'red', 10)], 1); return { status: r.status }; }),
  rl('CN-RL-03', 'VL', 'RN: entre 1 y 20 apuestas por tirada', 'Veinte apuestas (máximo exacto)', '20 apuestas de 10 a distintos plenos', { status: 200, totalApostado: 200 },
    async (ctx) => { const { r } = await jugar(ctx, 5000, Array.from({ length: 20 }, (_, i) => bet('straight', i, 10)), 36); return { status: r.status, totalApostado: r.body.totalBet }; }),
  rl('CN-RL-04', 'VL', 'RN: entre 1 y 20 apuestas por tirada', 'Veintiuna apuestas (justo encima del máximo)', '21 apuestas', { status: 400 },
    async (ctx) => { const u = await ctx.usuario({ balance: 5000 }); return { status: (await girar(ctx, u.token, Array.from({ length: 21 }, (_, i) => bet('straight', i, 10)))).status }; }),

  // ── Monto de cada apuesta: 10 a 100,000 ──
  rl('CN-RL-05', 'VL', 'RN: cada apuesta entre 10 y 100,000', 'Apuesta de 9 (debajo del mínimo)', 'amount=9', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await girar(ctx, u.token, [bet('color', 'red', 9)])).status }; }),
  rl('CN-RL-06', 'VL', 'RN: cada apuesta entre 10 y 100,000', 'Apuesta de 10 (mínimo exacto)', 'amount=10', { status: 200 },
    async (ctx) => { const { r } = await jugar(ctx, 1000, [bet('color', 'red', 10)], 1); return { status: r.status }; }),
  rl('CN-RL-07', 'VL', 'RN: cada apuesta entre 10 y 100,000', 'Apuesta de 100,000 (máximo exacto)', 'amount=100000', { status: 200 },
    async (ctx) => { const { r } = await jugar(ctx, 200000, [bet('color', 'red', 100000)], 1); return { status: r.status }; }),
  rl('CN-RL-08', 'VL', 'RN: cada apuesta entre 10 y 100,000', 'Apuesta de 100,001 (encima del máximo)', 'amount=100001', { status: 400 },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); return { status: (await girar(ctx, u.token, [bet('color', 'red', 100001)])).status }; }),
  rl('CN-RL-09', 'VL', 'RN: el total de la tirada no pasa de 100,000', 'Dos apuestas de 60,000 (total 120,000)', '2 × 60,000', { status: 400, mensaje: 'El total apostado en la tirada no puede superar 100,000' },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); const r = await girar(ctx, u.token, [bet('color', 'red', 60000), bet('parity', 'odd', 60000)]); return { status: r.status, mensaje: r.body.message }; }),
  rl('CN-RL-10', 'EP', 'RN: el monto es un entero', 'Montos inválidos: decimal, texto, negativo, vacío', 'amount = 10.5 | "x" | -10 | null', { statuses: [400, 400, 400, 400] },
    async (ctx) => { const u = await ctx.usuario(); const statuses = []; for (const a of [10.5, 'x', -10, null]) statuses.push((await girar(ctx, u.token, [bet('color', 'red', a)])).status); return { statuses }; }),

  // ── Tipo y selección de la apuesta: clases de equivalencia ──
  rl('CN-RL-11', 'EP', 'RN: solo existen 6 tipos de apuesta', 'Tipo de apuesta inexistente', 'betType="banana"', { status: 400, mensaje: 'Tipo de apuesta inválido' },
    async (ctx) => { const u = await ctx.usuario(); const r = await girar(ctx, u.token, [bet('banana', 1, 10)]); return { status: r.status, mensaje: r.body.message }; }),
  rl('CN-RL-12', 'EP', 'RN: cada tipo acepta solo sus selecciones (pleno 0-36, color rojo/negro, par/impar, falta/pasa, docena y columna 1-3)', 'Selecciones inválidas para cada tipo (9 clases inválidas)', 'pleno 37 | pleno -1 | pleno "abc" | color "verde" | parity "primo" | half "medio" | docena 4 | docena 0 | columna 4', { statuses: [400, 400, 400, 400, 400, 400, 400, 400, 400] },
    async (ctx) => { const u = await ctx.usuario({ balance: 100000 }); const statuses = []; for (const [t, s] of [['straight', 37], ['straight', -1], ['straight', 'abc'], ['color', 'green'], ['parity', 'prime'], ['half', 'mid'], ['dozen', 4], ['dozen', 0], ['column', 4]]) statuses.push((await girar(ctx, u.token, [bet(t, s, 10)])).status); return { statuses }; }),
  rl('CN-RL-13', 'VL', 'RN: pleno del 0 al 36; docena y columna del 1 al 3', 'Selecciones en el borde permitido: pleno 0 y 36, docena 1 y 3, columna 1 y 3', '6 apuestas límite aceptadas', { statuses: [200, 200, 200, 200, 200, 200] },
    async (ctx) => { vacia(ctx); const u = await ctx.usuario({ balance: 100000 }); const statuses = []; for (const [t, s] of [['straight', 0], ['straight', 36], ['dozen', 1], ['dozen', 3], ['column', 1], ['column', 3]]) { ctx.sorteo(5); statuses.push((await girar(ctx, u.token, [bet(t, s, 10)])).status); ctx.sorteoReal(); } return { statuses }; }),
  rl('CN-RL-14', 'EP', 'RN: una selección vacía o nula NO es el número 0', 'Pleno con selección nula, vacía, [] o false debe rechazarse (no equivale a apostar al 0)', 'straight con selection = null | "" | [] | false', { statuses: [400, 400, 400, 400], saldoCambia: false },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); const statuses = []; for (const s of [null, '', [], false]) statuses.push((await girar(ctx, u.token, [bet('straight', s, 10)])).status); return { statuses, saldoCambia: ctx.saldo(u.id) !== 1000 }; }),
  rl('CN-RL-15', 'EP', 'RN: la selección puede llegar como texto numérico', 'Pleno "17" como texto cuenta como el número 17', 'selection="17", sale 17', { status: 200, premio: 360 },
    async (ctx) => { const { r } = await jugar(ctx, 1000, [bet('straight', '17', 10)], 17); return { status: r.status, premio: r.body.totalWin }; }),

  // ── Pagos: tabla de decisión (apuesta × número que sale) ──
  rl('CN-RL-16', 'TD', 'Pago: pleno 35 a 1 (devuelve 36 veces)', 'Pleno acertado: 10 al 7, sale 7', 'pleno 7 por 10, sale 7', { totalWin: 360, saldoFinal: 1350 },
    async (ctx) => { const { r, u } = await jugar(ctx, 1000, [bet('straight', 7, 10)], 7); return { totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-17', 'TD', 'Pago: pleno fallado pierde la apuesta', 'Pleno 7 por 10, sale 8', 'pleno 7 por 10, sale 8', { totalWin: 0, saldoFinal: 990 },
    async (ctx) => { const { r, u } = await jugar(ctx, 1000, [bet('straight', 7, 10)], 8); return { totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-18', 'TD', 'Pago: color 1 a 1 (devuelve el doble); el 1 es rojo', 'Rojo gana con el 1; negro pierde con el 1', 'rojo 100 y negro 100, sale 1', { totalWin: 200, saldoFinal: 1000 },
    async (ctx) => { const { r, u } = await jugar(ctx, 1000, [bet('color', 'red', 100), bet('color', 'black', 100)], 1); return { totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-19', 'TD', 'Regla La Partage: con el 0 las apuestas simples devuelven la mitad', 'Rojo 100 con el 0: devuelve 50', 'rojo 100, sale 0', { totalWin: 50, saldoFinal: 950 },
    async (ctx) => { const { r, u } = await jugar(ctx, 1000, [bet('color', 'red', 100)], 0); return { totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-20', 'TD', 'Regla La Partage: aplica a color, par/impar y falta/pasa, no a docena, columna ni pleno', 'Con el 0: par 100, falta 100, docena 100, columna 100, pleno 5 de 100', 'sale 0', { totalWin: 100, saldoFinal: 100 },
    async (ctx) => { const { r, u } = await jugar(ctx, 500, [bet('parity', 'even', 100), bet('half', 'low', 100), bet('dozen', 1, 100), bet('column', 1, 100), bet('straight', 5, 100)], 0); return { totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-21', 'VL', 'Pago: docena 2 = números 13 a 24 (2 a 1)', 'Fronteras de la docena 2: 12 y 25 pierden; 13 y 24 ganan', 'docena 2 por 100 con 12, 13, 24, 25', { con12: 0, con13: 300, con24: 300, con25: 0 },
    async (ctx) => { const out = {}; for (const n of [12, 13, 24, 25]) out[`con${n}`] = (await jugar(ctx, 1000, [bet('dozen', 2, 100)], n)).r.body.totalWin; return out; }),
  rl('CN-RL-22', 'VL', 'Pago: columna 1 = 1,4,7…34 (2 a 1)', 'Columna 1 gana con 34 y pierde con 35', 'columna 1 por 100 con 34 y 35', { con34: 300, con35: 0 },
    async (ctx) => ({ con34: (await jugar(ctx, 1000, [bet('column', 1, 100)], 34)).r.body.totalWin, con35: (await jugar(ctx, 1000, [bet('column', 1, 100)], 35)).r.body.totalWin })),
  rl('CN-RL-23', 'VL', 'Pago: falta = 1-18, pasa = 19-36', 'Frontera 18/19: falta gana con 18, pasa gana con 19', 'falta con 18 · pasa con 18 · falta con 19 · pasa con 19', { faltaCon18: 200, pasaCon18: 0, faltaCon19: 0, pasaCon19: 200 },
    async (ctx) => ({ faltaCon18: (await jugar(ctx, 1000, [bet('half', 'low', 100)], 18)).r.body.totalWin, pasaCon18: (await jugar(ctx, 1000, [bet('half', 'high', 100)], 18)).r.body.totalWin, faltaCon19: (await jugar(ctx, 1000, [bet('half', 'low', 100)], 19)).r.body.totalWin, pasaCon19: (await jugar(ctx, 1000, [bet('half', 'high', 100)], 19)).r.body.totalWin })),
  rl('CN-RL-24', 'ES', 'RN: varias apuestas en la misma tirada se liquidan contra el mismo número', 'Pleno 17 (50) + negro (100) + docena 2 (100), sale 17: 250 apostados, 2,300 de premio', 'sale 17 (negro, docena 2)', { totalBet: 250, totalWin: 2300, saldoFinal: 3050 },
    async (ctx) => { const { r, u } = await jugar(ctx, 1000, [bet('straight', 17, 50), bet('color', 'black', 100), bet('dozen', 2, 100)], 17); return { totalBet: r.body.totalBet, totalWin: r.body.totalWin, saldoFinal: ctx.saldo(u.id) }; }),
  rl('CN-RL-25', 'TD', 'Tabla: saldo menor que el total apostado → se rechaza toda la tirada', 'Saldo 100 con apuestas por 150: no se gira ni se cobra nada', 'saldo=100, apuestas 100+50', { status: 400, saldo: 100, girosRegistrados: 0 },
    async (ctx) => { vacia(ctx); const u = await ctx.usuario({ balance: 100 }); const r = await girar(ctx, u.token, [bet('color', 'red', 100), bet('parity', 'odd', 50)]); return { status: r.status, saldo: ctx.saldo(u.id), girosRegistrados: ctx.db.spins.length }; }),
  rl('CN-RL-26', 'TE', 'RN: jugar exige sesión', 'Girar sin token', 'POST /api/roulette/spin sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/roulette/spin', { body: { bets: [bet('color', 'red', 10)] } })).status })),

  // ── Números calientes (regla de negocio propia): ventana 100, mínimo 30 giros, top 5, +50% en pleno ──
  rl('CN-RL-27', 'TD', 'RN: con ≥30 giros de historial, los más repetidos son "calientes" y su pleno paga +50%', 'Historial de 40 giros con el 17 en 20: pleno 17 por 10 paga 540 (10×36×1.5)', '40 giros previos (17 sale 20 veces), pleno 17 por 10, sale 17', { calienteIncluye17: true, totalWin: 540 },
    async (ctx) => { vacia(ctx); for (let i = 0; i < 20; i++) ctx.db.spins.push({ number: 17, color: 'black' }); for (let n = 1; n <= 20; n++) if (n !== 17) ctx.db.spins.push({ number: n, color: 'red' }); ctx.db.spins.push({ number: 21, color: 'red' }); const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(17); const r = await girar(ctx, u.token, [bet('straight', 17, 10)]); ctx.sorteoReal(); return { calienteIncluye17: r.body.hotNumbers.some((h) => h.number === 17), totalWin: r.body.totalWin }; }),
  rl('CN-RL-28', 'VL', 'RN: hacen falta 30 giros de historial para que existan números calientes', 'Con solo 10 giros previos no hay calientes y el pleno paga lo normal (360)', '10 giros previos del 17, pleno 17 por 10', { hotNumbers: 0, totalWin: 360 },
    async (ctx) => { vacia(ctx); for (let i = 0; i < 10; i++) ctx.db.spins.push({ number: 17, color: 'black' }); const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(17); const r = await girar(ctx, u.token, [bet('straight', 17, 10)]); ctx.sorteoReal(); return { hotNumbers: r.body.hotNumbers.length, totalWin: r.body.totalWin }; }),
  rl('CN-RL-29', 'TD', 'RN: el bono caliente solo aplica al pleno', 'Con el 17 caliente, apostar a negro (sale 17) paga solo 2× (200)', '≥30 giros con 17 caliente, negro por 100, sale 17', { totalWin: 200 },
    async (ctx) => { vacia(ctx); for (let i = 0; i < 35; i++) ctx.db.spins.push({ number: 17, color: 'black' }); const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(17); const r = await girar(ctx, u.token, [bet('color', 'black', 100)]); ctx.sorteoReal(); return { totalWin: r.body.totalWin }; }),
  rl('CN-RL-30', 'EP', 'RN: /hot-numbers exige sesión y devuelve una lista', 'Consulta de números calientes sin y con token', 'GET /api/roulette/hot-numbers', { sinToken: 401, conToken: 200, esLista: true },
    async (ctx) => { const u = await ctx.usuario(); const a = await ctx.api('GET', '/api/roulette/hot-numbers'); const b = await ctx.api('GET', '/api/roulette/hot-numbers', { token: u.token }); return { sinToken: a.status, conToken: b.status, esLista: Array.isArray(b.body.hotNumbers) }; }),
];

module.exports = { nombre: 'api-ruleta', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
