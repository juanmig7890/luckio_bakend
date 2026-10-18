// CAJA NEGRA · Tragamonedas, pozo progresivo y niveles VIP (a través de la API)
const { crearEntorno } = require('./entorno');

const slots = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Tragamonedas', regla, objetivo, entrada, esperadoValor, run });
const vip = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Niveles VIP', regla, objetivo, entrada, esperadoValor, run });

// Valores de crypto.randomInt(0,100) que producen cada símbolo (pesos 34/27/19/11/6/3)
const SIM = { cereza: 0, limon: 34, campana: 61, diamante: 80, siete: 91, jackpot: 99 };
// Grilla SIN ninguna línea ni 3 comodines:  🍒 🍋 🔔 / 💎 7️⃣ 🍒 / 🍋 🔔 💎
const PIERDE = [SIM.cereza, SIM.limon, SIM.campana, SIM.diamante, SIM.siete, SIM.cereza, SIM.limon, SIM.campana, SIM.diamante];
// Grilla con exactamente DOS 🎰 y sin líneas
const DOS_JACKPOT = [SIM.jackpot, SIM.limon, SIM.campana, SIM.diamante, SIM.jackpot, SIM.cereza, SIM.limon, SIM.campana, SIM.diamante];

const girar = (ctx, token, amount) => ctx.api('POST', '/api/slots/spin', { token, body: { amount } });

const casos = [
  // ── Validación de la apuesta (valores límite 10 – 100,000) ──
  slots('CN-SLT-01', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 9 (justo debajo del mínimo)', 'amount=9', { status: 400, saldoCambia: false },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); const r = await girar(ctx, u.token, 9); return { status: r.status, saldoCambia: ctx.saldo(u.id) !== 1000 }; }),
  slots('CN-SLT-02', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 10 (mínimo exacto): se cobra y se juega', 'amount=10, grilla sin premio', { status: 200, saldoFinal: 990, premio: 0 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(PIERDE); const r = await girar(ctx, u.token, 10); ctx.sorteoReal(); return { status: r.status, saldoFinal: ctx.saldo(u.id), premio: r.body.winAmount }; }),
  slots('CN-SLT-03', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 100,000 (máximo exacto)', 'amount=100000, saldo 200,000', { status: 200, saldoFinal: 100000 },
    async (ctx) => { const u = await ctx.usuario({ balance: 200000 }); ctx.sorteo(PIERDE); const r = await girar(ctx, u.token, 100000); ctx.sorteoReal(); return { status: r.status, saldoFinal: ctx.saldo(u.id) }; }),
  slots('CN-SLT-04', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 100,001 (justo encima del máximo)', 'amount=100001', { status: 400 },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); return { status: (await girar(ctx, u.token, 100001)).status }; }),
  slots('CN-SLT-05', 'EP', 'RN: la apuesta es un entero', 'Apuestas inválidas: decimal, texto, negativa, vacía', 'amount = 10.5 | "mucho" | -50 | null', { statuses: [400, 400, 400, 400] },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); const statuses = []; for (const a of [10.5, 'mucho', -50, null]) statuses.push((await girar(ctx, u.token, a)).status); return { statuses }; }),
  slots('CN-SLT-06', 'TD', 'Tabla: saldo vs apuesta → saldo menor rechaza sin tocar nada', 'Saldo 50 y apuesta 100: "Saldo insuficiente" y el saldo no cambia', 'saldo=50, amount=100', { status: 400, mensaje: 'Saldo insuficiente', saldo: 50 },
    async (ctx) => { const u = await ctx.usuario({ balance: 50 }); const r = await girar(ctx, u.token, 100); return { status: r.status, mensaje: r.body.message, saldo: ctx.saldo(u.id) }; }),
  slots('CN-SLT-07', 'VL', 'Tabla: saldo igual a la apuesta sí alcanza', 'Saldo exactamente igual a la apuesta (100 y 100)', 'saldo=100, amount=100', { status: 200, saldoFinal: 0 },
    async (ctx) => { const u = await ctx.usuario({ balance: 100 }); ctx.sorteo(PIERDE); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { status: r.status, saldoFinal: ctx.saldo(u.id) }; }),
  slots('CN-SLT-08', 'VL', 'Tabla: saldo un peso menor no alcanza', 'Saldo 99 y apuesta 100', 'saldo=99, amount=100', { status: 400, saldo: 99 },
    async (ctx) => { const u = await ctx.usuario({ balance: 99 }); const r = await girar(ctx, u.token, 100); return { status: r.status, saldo: ctx.saldo(u.id) }; }),
  slots('CN-SLT-09', 'TE', 'RN: jugar exige sesión', 'Girar sin token', 'POST /api/slots/spin sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/slots/spin', { body: { amount: 10 } })).status })),

  // ── Pagos: tabla de decisión (combinación de símbolos → premio) ──
  slots('CN-SLT-10', 'TD', 'Pago: 3 cerezas en línea = ×8 de la apuesta por línea (5 líneas)', 'Grilla de 9 cerezas: las 5 líneas pagan', 'apuesta 100, todas 🍒', { premio: 800, saldoFinal: 1700, lineas: 5 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(SIM.cereza); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { premio: r.body.winAmount, saldoFinal: ctx.saldo(u.id), lineas: r.body.winningLines.length }; }),
  slots('CN-SLT-11', 'TD', 'Pago: 3 sietes en línea = ×200', 'Grilla de 9 sietes', 'apuesta 100, todas 7️⃣', { premio: 20000, saldoFinal: 20900 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(SIM.siete); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { premio: r.body.winAmount, saldoFinal: ctx.saldo(u.id) }; }),
  slots('CN-SLT-12', 'TD', 'Pago: sin 3 iguales en línea no hay premio', 'Grilla sin líneas ganadoras', 'apuesta 100', { premio: 0, lineas: 0, saldoFinal: 900 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.sorteo(PIERDE); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { premio: r.body.winAmount, lineas: r.body.winningLines.length, saldoFinal: ctx.saldo(u.id) }; }),
  slots('CN-SLT-13', 'VL', 'Pozo: 3 o más 🎰 en cualquier lugar ganan el pozo', 'Grilla llena de 🎰 (9): gana el pozo acumulado y el pozo se reinicia a 1,000', 'pozo=2,500, apuesta 100, 9×🎰', { jackpotWon: 2500, saldoFinal: 3400, pozoDespues: 1000 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.setPozo(2500); ctx.sorteo(SIM.jackpot); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { jackpotWon: r.body.jackpotWon, saldoFinal: ctx.saldo(u.id), pozoDespues: ctx.pozo() }; }),
  slots('CN-SLT-14', 'VL', 'Pozo: con 2 🎰 NO se gana (el mínimo es 3)', 'Exactamente 2 comodines: no hay pozo y el pozo crece 1% de la apuesta', 'pozo=1,000, apuesta 100, 2×🎰', { scatter: 2, jackpotWin: false, jackpotWon: 0, pozoDespues: 1001 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.setPozo(1000); ctx.sorteo(DOS_JACKPOT); const r = await girar(ctx, u.token, 100); ctx.sorteoReal(); return { scatter: r.body.scatterCount, jackpotWin: r.body.jackpotWin, jackpotWon: r.body.jackpotWon, pozoDespues: ctx.pozo() }; }),
  slots('CN-SLT-15', 'VL', 'Pozo: cada apuesta aporta 1% (mínimo 1 ficha)', 'Aporte con apuesta 10 (0.1 → mínimo 1) y con apuesta 250 (2.5 → 2)', 'dos giros perdedores: 10 y 250', { tras10: 1001, tras250: 1003 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); ctx.setPozo(1000); ctx.sorteo(PIERDE); await girar(ctx, u.token, 10); const tras10 = ctx.pozo(); ctx.sorteo(PIERDE); await girar(ctx, u.token, 250); const tras250 = ctx.pozo(); ctx.sorteoReal(); return { tras10, tras250 }; }),
  slots('CN-SLT-16', 'TE', 'RN: ver el pozo exige sesión', 'GET /jackpot sin token y con token', 'sin token / con token', { sinToken: 401, conToken: 200, monto: 1000 },
    async (ctx) => { const u = await ctx.usuario(); ctx.setPozo(1000); const a = await ctx.api('GET', '/api/slots/jackpot'); const b = await ctx.api('GET', '/api/slots/jackpot', { token: u.token }); return { sinToken: a.status, conToken: b.status, monto: b.body.amount }; }),
  slots('CN-SLT-17', 'ES', 'RN: conservación del dinero: saldo final = inicial − apuestas + premios', 'Propiedad con 60 giros reales (sorteo criptográfico real)', '60 giros de 10 fichas', { conserva: true },
    async (ctx) => { const u = await ctx.usuario({ balance: 100000 }); let premios = 0; for (let i = 0; i < 60; i++) { const r = await girar(ctx, u.token, 10); premios += r.body.winAmount + r.body.jackpotWon; } return { conserva: ctx.saldo(u.id) === 100000 - 600 + premios }; }),

  // ── Niveles VIP: límites 5,000 / 20,000 / 50,000 apostados ──
  ...[
    ['CN-VIP-01', 4989, 'Bronce', 'Total 4,999 apostados: sigue en Bronce'],
    ['CN-VIP-02', 4990, 'Plata', 'Total 5,000 apostados: sube a Plata'],
    ['CN-VIP-03', 19989, 'Plata', 'Total 19,999: sigue en Plata'],
    ['CN-VIP-04', 19990, 'Oro', 'Total 20,000: sube a Oro'],
    ['CN-VIP-05', 49989, 'Oro', 'Total 49,999: sigue en Oro'],
    ['CN-VIP-06', 49990, 'VIP LUCK.IO', 'Total 50,000: sube a VIP LUCK.IO'],
  ].map(([id, previo, nivel, objetivo]) => vip(id, 'VL', 'RN: Plata ≥5,000 · Oro ≥20,000 · VIP ≥50,000 fichas apostadas en total', objetivo, `ya apostado ${previo} + apuesta de 10`, { nivel },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000, totalWagered: previo }); ctx.sorteo(PIERDE); const r = await girar(ctx, u.token, 10); ctx.sorteoReal(); return { nivel: r.body.user.vipLevel }; })),
];

module.exports = { nombre: 'api-slots', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
