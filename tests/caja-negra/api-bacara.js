// CAJA NEGRA · Bacará (Punto Banco) a través de la API, con mazos arreglados para conocer el resultado esperado
const { crearEntorno } = require('./entorno');

const bc = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Bacará', regla, objetivo, entrada, esperadoValor, run });
const jugar = (ctx, token, bets) => ctx.api('POST', '/api/baccarat/play', { token, body: { bets } });
// Reparte con un mazo arreglado (orden: Punto, Banca, Punto, Banca, [3.ª Punto], [3.ª Banca]) y devuelve la respuesta + saldo
const ronda = async (ctx, codigos, bets, saldo = 10000) => {
  const u = await ctx.usuario({ balance: saldo });
  ctx.mazo(...codigos);
  const r = await jugar(ctx, u.token, bets);
  ctx.mazoReal();
  return { r, saldo: ctx.saldo(u.id), u };
};
const neutro = ['4H', '2S', '5D', '3C']; // ronda válida cualquiera (Punto 9 natural)

const casos = [
  // ── Validación de apuestas ──
  bc('CN-BAC-01', 'EP', 'RN: hay que apostar en al menos una casilla', 'Sin apuestas: objeto vacío y todo en cero', 'bets={} | bets todos 0', { statuses: [400, 400] },
    async (ctx) => { const u = await ctx.usuario(); return { statuses: [(await jugar(ctx, u.token, {})).status, (await jugar(ctx, u.token, { player: 0, banker: 0, tie: 0 })).status] }; }),
  bc('CN-BAC-02', 'VL', 'RN: apuesta mínima de 10 por casilla', 'Casilla con 5 (debajo del mínimo)', 'player=5', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await jugar(ctx, u.token, { player: 5 })).status }; }),
  bc('CN-BAC-03', 'VL', 'RN: apuesta mínima de 10 por casilla', 'Casilla con 10 (mínimo exacto)', 'player=10', { status: 200 },
    async (ctx) => { const { r } = await ronda(ctx, neutro, { player: 10 }); return { status: r.status }; }),
  bc('CN-BAC-04', 'VL', 'RN: el total de la ronda no pasa de 100,000', 'Total de 100,000 (máximo) y de 100,001 (encima)', 'player=100000 | player=100000 + tie=1…', { enElMaximo: 200, porEncima: 400 },
    async (ctx) => { const a = await ronda(ctx, neutro, { player: 100000 }, 300000); const u = await ctx.usuario({ balance: 300000 }); const b = await jugar(ctx, u.token, { player: 100000, banker: 10 }); return { enElMaximo: a.r.status, porEncima: b.status }; }),
  bc('CN-BAC-05', 'EP', 'RN: cada apuesta es un entero positivo', 'Apuestas inválidas: negativa, decimal, texto', 'player=-10 | player=10.5 | player="abc"', { statuses: [400, 400, 400] },
    async (ctx) => { const u = await ctx.usuario(); const s = []; for (const v of [-10, 10.5, 'abc']) s.push((await jugar(ctx, u.token, { player: v })).status); return { statuses: s }; }),
  bc('CN-BAC-06', 'TD', 'Tabla: saldo menor que el total → se rechaza sin cobrar', 'Saldo 100, apuestas 100+100', 'saldo=100, player=100 + banker=100', { status: 400, saldo: 100 },
    async (ctx) => { const u = await ctx.usuario({ balance: 100 }); const r = await jugar(ctx, u.token, { player: 100, banker: 100 }); return { status: r.status, saldo: ctx.saldo(u.id) }; }),
  bc('CN-BAC-07', 'TE', 'RN: jugar exige sesión', 'Jugar sin token', 'POST /api/baccarat/play sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/baccarat/play', { body: { bets: { player: 10 } } })).status })),

  // ── Pagos: tabla de decisión (ganador × tipo de apuesta) ──
  bc('CN-BAC-08', 'TD', 'Pago: Punto 1 a 1', 'Gana el Punto (natural 9 contra 5) con 100 al Punto', 'Punto 4+5=9, Banca 2+3=5, apuesta player 100', { ganador: 'player', natural: true, totalWin: 200, saldo: 10100 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['4H', '2S', '5D', '3C'], { player: 100 }); return { ganador: r.body.winner, natural: r.body.natural, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-09', 'TD', 'Pago: Banca 1 a 1 con 5% de comisión', 'Gana la Banca con 100 a la Banca: paga 95 de ganancia (195 en total)', 'Punto 2+3 roba K (0)=5; Banca 4+3=7; banker 100', { ganador: 'banker', totalWin: 195, saldo: 10095 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['2H', '4S', '3D', '3C', 'KC'], { banker: 100 }); return { ganador: r.body.winner, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-10', 'TD', 'Pago: Empate 8 a 1; el Punto se devuelve', 'Empate 8-8 con 100 al Punto y 50 al Empate', 'Punto 4+4=8, Banca 5+3=8', { ganador: 'tie', totalBet: 150, totalWin: 550, saldo: 10400 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['4H', '5S', '4D', '3C'], { player: 100, tie: 50 }); return { ganador: r.body.winner, totalBet: r.body.totalBet, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-11', 'TD', 'Pago: apuesta al Empate pierde si no hay empate', 'Gana el Punto: la apuesta de 50 al Empate se pierde', 'Punto 9 vs Banca 5, tie 50 + player 100', { totalWin: 200, saldo: 10050 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['4H', '2S', '5D', '3C'], { player: 100, tie: 50 }); return { totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-12', 'TD', 'Pago: Par del Punto 11 a 1 (las 2 primeras cartas del mismo valor)', 'K♥ + K♠ en el Punto: par de 100 paga 1,200', 'Punto K+K, Banca 3+5=8', { playerPair: true, totalWin: 1200, saldo: 11100 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['KH', '3C', 'KS', '5D'], { playerPair: 100 }); return { playerPair: r.body.playerPair, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-13', 'TD', 'Par: K con 10 NO es par (valores distintos aunque ambos valgan 0)', 'K♥ + 10♠: no hay par, se pierde la apuesta', 'Punto K+10', { playerPair: false, totalWin: 0, saldo: 9900 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['KH', '3C', '0S', '5D'], { playerPair: 100 }); return { playerPair: r.body.playerPair, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-14', 'TD', 'Pago: Par de la Banca 11 a 1', 'Banca 9♣ + 9♠: par de 10 paga 120', 'Banca 9+9', { bankerPair: true, totalWin: 120 },
    async (ctx) => { const { r } = await ronda(ctx, ['2H', '9C', '3D', '9S'], { bankerPair: 10 }); return { bankerPair: r.body.bankerPair, totalWin: r.body.totalWin }; }),
  bc('CN-BAC-15', 'ES', 'RN: se pueden hacer varias apuestas a la vez (que no se excluyan); cada una se liquida aparte', 'Punto 100 + Par Banca 20 cuando gana el Punto: se cobran 120 y solo paga el Punto', 'Punto 9 vs Banca 5 (2+3, sin par)', { totalBet: 120, totalWin: 200, saldo: 10080 },
    async (ctx) => { const { r, saldo } = await ronda(ctx, ['4H', '2S', '5D', '3C'], { player: 100, bankerPair: 20 }); return { totalBet: r.body.totalBet, totalWin: r.body.totalWin, saldo }; }),
  bc('CN-BAC-24', 'EP', 'RN: no se puede apostar a Punto y a Banca en la misma mano', 'Apostar 50 al Punto y 50 a la Banca a la vez (no se permite, como en una mesa real)', 'player=50, banker=50', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await jugar(ctx, u.token, { player: 50, banker: 50 })).status }; }),

  // ── Tercera carta: tabla de decisión con escenarios completos ──
  bc('CN-BAC-16', 'VL', 'Regla: el Punto pide con 5 o menos y se planta con 6 o más', 'Punto 5 roba tercera carta (2 cartas → 3)', 'Punto 2+3=5', { cartasPunto: 3 },
    async (ctx) => { const { r } = await ronda(ctx, ['2H', '4S', '3D', '3C', 'KC'], { player: 10 }); return { cartasPunto: r.body.playerCards.length }; }),
  bc('CN-BAC-17', 'VL', 'Regla: el Punto pide con 5 o menos y se planta con 6 o más', 'Punto 6 se planta (queda con 2 cartas) y la Banca con 5 sí roba', 'Punto 3+3=6, Banca 2+3=5', { cartasPunto: 2, cartasBanca: 3, ganador: 'banker' },
    async (ctx) => { const { r } = await ronda(ctx, ['3H', '2S', '3D', '3C', '4D'], { player: 10 }); return { cartasPunto: r.body.playerCards.length, cartasBanca: r.body.bankerCards.length, ganador: r.body.winner }; }),
  bc('CN-BAC-18', 'TD', 'Regla: Banca con 6 pide solo si la 3.ª del Punto es 6 o 7', 'Banca 6 y 3.ª del Punto = 6 → la Banca pide', 'Punto 2+3 roba 6; Banca 3+3=6', { cartasBanca: 3, ganador: 'banker' },
    async (ctx) => { const { r } = await ronda(ctx, ['2H', '3S', '3D', '3C', '6C', '2D'], { player: 10 }); return { cartasBanca: r.body.bankerCards.length, ganador: r.body.winner }; }),
  bc('CN-BAC-19', 'TD', 'Regla: Banca con 6 pide solo si la 3.ª del Punto es 6 o 7', 'Banca 6 y 3.ª del Punto = 5 → la Banca se planta', 'Punto 2+3 roba 5; Banca 3+3=6', { cartasBanca: 2, ganador: 'banker' },
    async (ctx) => { const { r } = await ronda(ctx, ['2H', '3S', '3D', '3C', '5C'], { player: 10 }); return { cartasBanca: r.body.bankerCards.length, ganador: r.body.winner }; }),
  bc('CN-BAC-20', 'TD', 'Regla: con 8 o 9 ("natural") nadie roba', 'Natural en el Punto: ni el Punto ni la Banca reciben tercera carta', 'Punto 4+5=9, Banca 2+3=5 (la Banca "pediría" si no hubiera natural)', { cartasPunto: 2, cartasBanca: 2, natural: true },
    async (ctx) => { const { r } = await ronda(ctx, ['4H', '2S', '5D', '3C'], { player: 10 }); return { cartasPunto: r.body.playerCards.length, cartasBanca: r.body.bankerCards.length, natural: r.body.natural }; }),
  bc('CN-BAC-21', 'VL', 'Regla: la Banca se planta con 7 si el Punto se plantó', 'Punto 6 (se planta) y Banca 7: la Banca no roba', 'Punto 3+3=6, Banca 4+3=7', { cartasBanca: 2, ganador: 'banker' },
    async (ctx) => { const { r } = await ronda(ctx, ['3H', '4S', '3D', '3C'], { player: 10 }); return { cartasBanca: r.body.bankerCards.length, ganador: r.body.winner }; }),
  bc('CN-BAC-22', 'ES', 'RN: el mazo es de 8 barajas y se usa uno nuevo por ronda', 'Una ronda con el mazo real termina en un resultado válido', 'ronda sin mazo arreglado', { valido: true },
    async (ctx) => { const u = await ctx.usuario(); const r = await jugar(ctx, u.token, { player: 10 }); return { valido: ['player', 'banker', 'tie'].includes(r.body.winner) && r.body.playerTotal >= 0 && r.body.playerTotal <= 9 && r.body.bankerTotal >= 0 && r.body.bankerTotal <= 9 }; }),
  bc('CN-BAC-23', 'TE', 'RN: el marcador muestra las últimas rondas, la más reciente primero', 'Tras 2 rondas el historial lista primero la última', 'ronda 1 gana Punto, ronda 2 gana Banca', { cantidad: 2, ultimaPrimero: 'banker' },
    async (ctx) => { const u = await ctx.usuario({ balance: 10000 }); ctx.mazo('4H', '2S', '5D', '3C'); await jugar(ctx, u.token, { player: 10 }); ctx.mazo('2H', '4S', '3D', '3C', 'KC'); await jugar(ctx, u.token, { banker: 10 }); ctx.mazoReal(); const h = await ctx.api('GET', '/api/baccarat/history', { token: u.token }); return { cantidad: h.body.rounds.length, ultimaPrimero: h.body.rounds[0].winner }; }),
];

module.exports = { nombre: 'api-bacara', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
