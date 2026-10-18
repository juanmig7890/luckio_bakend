// CAJA NEGRA · Blackjack a través de la API (mazo arreglado: orden jugador1, crupier1 visible, jugador2, crupier2 oculta, luego las que se pidan)
const { crearEntorno } = require('./entorno');

const bj = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Blackjack', regla, objetivo, entrada, esperadoValor, run });
const empezar = (ctx, token, body) => ctx.api('POST', '/api/blackjack/start', { token, body });
const accion = (ctx, token, id, nombre, body) => ctx.api('POST', `/api/blackjack/${id}/${nombre}`, { token, body });
const NEUTRO = ['2S', '9C', '5H', '7D']; // jugador 7, crupier 9+7: sin blackjack ni seguro

// Prepara usuario + mazo y empieza la partida
const partida = async (ctx, codigos, { saldo = 10000, monto = 100, ...extra } = {}) => {
  const u = await ctx.usuario({ balance: saldo });
  ctx.mazo(...codigos);
  const r = await empezar(ctx, u.token, { amount: monto, ...extra });
  return { u, r, g: r.body && r.body.game, saldo: () => ctx.saldo(u.id) };
};

const casos = [
  // ── Validación de la apuesta inicial y de las laterales ──
  bj('CN-BJ-01', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 9 (debajo del mínimo)', 'amount=9', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await empezar(ctx, u.token, { amount: 9 })).status }; }),
  bj('CN-BJ-02', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 10 (mínimo exacto)', 'amount=10', { status: 200, saldo: 9990 },
    async (ctx) => { const p = await partida(ctx, NEUTRO, { monto: 10 }); return { status: p.r.status, saldo: p.saldo() }; }),
  bj('CN-BJ-03', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 100,000 (máximo exacto)', 'amount=100000, saldo 200,000', { status: 200, saldo: 100000 },
    async (ctx) => { const p = await partida(ctx, NEUTRO, { monto: 100000, saldo: 200000 }); return { status: p.r.status, saldo: p.saldo() }; }),
  bj('CN-BJ-04', 'VL', 'RN: apuesta entre 10 y 100,000', 'Apuesta de 100,001 (encima del máximo)', 'amount=100001', { status: 400 },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); return { status: (await empezar(ctx, u.token, { amount: 100001 })).status }; }),
  bj('CN-BJ-05', 'EP', 'RN: las apuestas laterales son enteros entre 0 y 100,000', 'Laterales inválidas: Perfect Pairs negativa y 21+3 mayor al máximo', 'pairsBet=-5 | threeBet=100001', { statuses: [400, 400] },
    async (ctx) => { const u = await ctx.usuario({ balance: 500000 }); return { statuses: [(await empezar(ctx, u.token, { amount: 100, pairsBet: -5 })).status, (await empezar(ctx, u.token, { amount: 100, threeBet: 100001 })).status] }; }),
  bj('CN-BJ-06', 'VL', 'Tabla: saldo igual a la apuesta sí alcanza', 'Saldo 100 y apuesta 100: queda en 0', 'saldo=100, amount=100', { status: 200, saldo: 0 },
    async (ctx) => { const p = await partida(ctx, NEUTRO, { saldo: 100 }); return { status: p.r.status, saldo: p.saldo() }; }),
  bj('CN-BJ-07', 'VL', 'Tabla: saldo un peso menor no alcanza; no se crea partida', 'Saldo 99 y apuesta 100', 'saldo=99, amount=100', { status: 400, saldo: 99, partidas: 0 },
    async (ctx) => { ctx.db.games.clear(); const p = await partida(ctx, NEUTRO, { saldo: 99 }); return { status: p.r.status, saldo: p.saldo(), partidas: ctx.db.games.size }; }),
  bj('CN-BJ-08', 'TD', 'Tabla: apuesta + laterales mayores al saldo → no se cobra nada', 'Saldo 100, apuesta 100 + Perfect Pairs 50', 'saldo=100', { status: 400, saldo: 100, partidas: 0 },
    async (ctx) => { ctx.db.games.clear(); const p = await partida(ctx, NEUTRO, { saldo: 100, pairsBet: 50 }); return { status: p.r.status, saldo: p.saldo(), partidas: ctx.db.games.size }; }),
  bj('CN-BJ-09', 'TE', 'RN: jugar exige sesión', 'Empezar sin token', 'POST /api/blackjack/start sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/blackjack/start', { body: { amount: 100 } })).status })),

  // ── Resultados de la mano: tabla de decisión (jugador × crupier) ──
  bj('CN-BJ-10', 'TD', 'Pago: Blackjack natural 3 a 2', 'A♠+K♥ contra 9+7: paga 250 por 100', 'jugador A+K, crupier 9+7', { resultado: 'blackjack', estado: 'finished', saldo: 10150 },
    async (ctx) => { const p = await partida(ctx, ['AS', '9C', 'KH', '7D']); return { resultado: p.g.result, estado: p.g.status, saldo: p.saldo() }; }),
  bj('CN-BJ-11', 'VL', 'Pago: 3 a 2 redondea hacia abajo con apuesta impar', 'Blackjack con apuesta 25: paga 62 (no 62.5)', 'amount=25', { saldo: 10037 },
    async (ctx) => { const p = await partida(ctx, ['AS', '9C', 'KH', '7D'], { monto: 25 }); return { saldo: p.saldo() }; }),
  bj('CN-BJ-12', 'TD', 'Tabla: ambos con blackjack → empate (se devuelve la apuesta)', 'A+K contra K+A', 'jugador A+K, crupier K+A', { resultado: 'push', saldo: 10000 },
    async (ctx) => { const p = await partida(ctx, ['AS', 'KC', 'KH', 'AD']); return { resultado: p.g.result, saldo: p.saldo() }; }),
  bj('CN-BJ-13', 'TD', 'Tabla: el crupier con blackjack (sin As visible) gana de inmediato', 'Jugador 7 contra K+A del crupier', 'crupier K visible + A oculta', { resultado: 'lose', estado: 'finished', saldo: 9900 },
    async (ctx) => { const p = await partida(ctx, ['2S', 'KC', '5H', 'AD']); return { resultado: p.g.result, estado: p.g.status, saldo: p.saldo() }; }),
  bj('CN-BJ-14', 'TD', 'Tabla: el jugador se pasa de 21 → pierde y el crupier ni juega', '10+6 pide K → 26', 'pide una carta', { resultado: 'lose', saldo: 9900, cartasCrupier: 2 },
    async (ctx) => { const p = await partida(ctx, ['0S', '9C', '6H', '7D', 'KD']); const r = await accion(ctx, p.u.token, p.g.id, 'hit'); return { resultado: r.body.game.result, saldo: p.saldo(), cartasCrupier: r.body.game.dealerCards.length }; }),
  bj('CN-BJ-15', 'TD', 'Tabla: se planta con mejor mano que el crupier → gana 1 a 1', 'Jugador 19 contra crupier 18', 'se planta', { resultado: 'win', saldo: 10100 },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '9H', '8D']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { resultado: r.body.game.result, saldo: p.saldo() }; }),
  bj('CN-BJ-16', 'TD', 'Tabla: igual puntaje → empate, se devuelve la apuesta', 'Jugador 18 contra crupier 18', 'se planta', { resultado: 'push', saldo: 10000 },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '8H', '8D']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { resultado: r.body.game.result, saldo: p.saldo() }; }),
  bj('CN-BJ-17', 'TD', 'Tabla: peor puntaje que el crupier → pierde', 'Jugador 17 contra crupier 19', 'se planta', { resultado: 'lose', saldo: 9900 },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '7H', '9D']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { resultado: r.body.game.result, saldo: p.saldo() }; }),

  // ── Reglas del crupier: valores límite 16 / 17 ──
  bj('CN-BJ-18', 'VL', 'Regla: el crupier se planta en 17 duro', 'Crupier 10+7=17: no pide carta', 'crupier 17', { cartasCrupier: 2, resultado: 'win' },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '8H', '7D']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { cartasCrupier: r.body.game.dealerCards.length, resultado: r.body.game.result }; }),
  bj('CN-BJ-19', 'VL', 'Regla: el crupier se planta en TODOS los 17, también el suave (A+6)', 'Crupier A+6=17 suave: no pide carta', 'crupier 6 visible + A oculta', { cartasCrupier: 2, resultado: 'win' },
    async (ctx) => { const p = await partida(ctx, ['0S', '6C', '8H', 'AD']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { cartasCrupier: r.body.game.dealerCards.length, resultado: r.body.game.result }; }),
  bj('CN-BJ-20', 'VL', 'Regla: el crupier pide con 16 o menos', 'Crupier 10+6=16 pide un 3 y queda en 19', 'crupier 16', { cartasCrupier: 3, resultado: 'lose' },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '8H', '6D', '3C']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { cartasCrupier: r.body.game.dealerCards.length, resultado: r.body.game.result }; }),
  bj('CN-BJ-21', 'TD', 'Tabla: crupier se pasa → gana el jugador', 'Crupier 16 pide K y llega a 26', 'crupier 16 + K', { resultado: 'win', saldo: 10100 },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '8H', '6D', 'KC']); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { resultado: r.body.game.result, saldo: p.saldo() }; }),

  // ── Acciones: doblar, dividir, rendirse, seguro, Charlie ──
  bj('CN-BJ-22', 'TD', 'Regla: doblar cobra otra apuesta igual, da 1 sola carta y paga sobre el doble', '5+6=11 dobla, recibe 10 (21) y gana contra 18', 'doblar con 2 cartas', { resultado: 'win', apuestaFinal: 200, saldo: 10200 },
    async (ctx) => { const p = await partida(ctx, ['5S', '0C', '6H', '8D', '0H']); const r = await accion(ctx, p.u.token, p.g.id, 'double'); return { resultado: r.body.game.result, apuestaFinal: r.body.game.bet, saldo: p.saldo() }; }),
  bj('CN-BJ-23', 'EP', 'Regla: solo se dobla con 2 cartas', 'Con 3 cartas doblar se rechaza', 'pide una carta y luego dobla', { status: 400 },
    async (ctx) => { const p = await partida(ctx, ['2S', '0C', '3H', '8D', '2H']); await accion(ctx, p.u.token, p.g.id, 'hit'); return { status: (await accion(ctx, p.u.token, p.g.id, 'double')).status }; }),
  bj('CN-BJ-24', 'TD', 'Regla: dividir pares (2 manos, cada una con su apuesta)', 'Par de 8: mano1 8+3=11 (pierde), mano2 8+K=18 (gana) contra crupier 17', 'divide y se planta en ambas', { resultado: 'split', manos: 2, saldo: 10000 },
    async (ctx) => { const p = await partida(ctx, ['8S', '0C', '8H', '7D', '3D', 'KH']); const s = await accion(ctx, p.u.token, p.g.id, 'split'); await accion(ctx, p.u.token, p.g.id, 'stand'); const r = await accion(ctx, p.u.token, p.g.id, 'stand'); return { resultado: r.body.game.result, manos: s.body.game.hands.length, saldo: p.saldo() }; }),
  bj('CN-BJ-25', 'EP', 'Regla: solo se divide con 2 cartas del mismo valor', 'Intentar dividir 8+9', 'split con cartas distintas', { status: 400, saldo: 9900 },
    async (ctx) => { const p = await partida(ctx, ['8S', '0C', '9H', '7D']); const r = await accion(ctx, p.u.token, p.g.id, 'split'); return { status: r.status, saldo: p.saldo() }; }),
  bj('CN-BJ-26', 'TD', 'Regla: Ases divididos reciben 1 carta cada uno y un 21 ahí paga 1 a 1 (no 3 a 2)', 'A+A: mano1 A+K=21, mano2 A+5=16, crupier 17', 'divide Ases', { resultado: 'split', pagoMano1: 200, saldo: 10000 },
    async (ctx) => { const p = await partida(ctx, ['AS', '0C', 'AH', '7D', 'KD', '5D']); const r = await accion(ctx, p.u.token, p.g.id, 'split'); return { resultado: r.body.game.result, pagoMano1: r.body.game.hands[0].payout, saldo: p.saldo() }; }),
  bj('CN-BJ-27', 'TD', 'Regla: rendirse devuelve la mitad', 'Rendirse con 10+6 contra 10', 'surrender (apuesta 100)', { resultado: 'surrender', saldo: 9950 },
    async (ctx) => { const p = await partida(ctx, ['0S', '0C', '6H', '7D']); const r = await accion(ctx, p.u.token, p.g.id, 'surrender'); return { resultado: r.body.game.result, saldo: p.saldo() }; }),
  bj('CN-BJ-28', 'EP', 'Regla: solo se puede rendir con las 2 primeras cartas', 'Rendirse después de pedir carta', 'hit y luego surrender', { status: 400 },
    async (ctx) => { const p = await partida(ctx, ['2S', '0C', '3H', '8D', '2H']); await accion(ctx, p.u.token, p.g.id, 'hit'); return { status: (await accion(ctx, p.u.token, p.g.id, 'surrender')).status }; }),
  bj('CN-BJ-29', 'TE', 'Regla: con As visible se ofrece el seguro y no se puede jugar hasta decidir', 'Crupier muestra A: pedir carta antes de decidir el seguro', 'hit con seguro pendiente', { seguro: 'offered', status: 409 },
    async (ctx) => { const p = await partida(ctx, ['0S', 'AH', '7D', 'KC']); const r = await accion(ctx, p.u.token, p.g.id, 'hit'); return { seguro: p.g.insurance, status: r.status }; }),
  bj('CN-BJ-30', 'TD', 'Regla: el seguro cuesta la mitad y paga 2 a 1 si el crupier tiene blackjack', 'Seguro tomado y el crupier tiene A+K: queda en tablas', 'seguro 50 sobre apuesta 100', { costoSeguro: 50, pagoSeguro: 150, resultado: 'lose', saldo: 10000 },
    async (ctx) => { const p = await partida(ctx, ['0S', 'AH', '7D', 'KC']); const r = await accion(ctx, p.u.token, p.g.id, 'insurance', { take: true }); return { costoSeguro: r.body.game.insuranceBet, pagoSeguro: r.body.game.insurancePayout, resultado: r.body.game.result, saldo: p.saldo() }; }),
  bj('CN-BJ-31', 'TD', 'Regla: sin blackjack del crupier el seguro se pierde y la mano sigue', 'Seguro tomado y el crupier tiene A+6', 'seguro 50, crupier no tiene blackjack', { estado: 'active', saldo: 9850 },
    async (ctx) => { const p = await partida(ctx, ['0S', 'AH', '7D', '6C']); const r = await accion(ctx, p.u.token, p.g.id, 'insurance', { take: true }); return { estado: r.body.game.status, saldo: p.saldo() }; }),
  bj('CN-BJ-32', 'EP', 'Regla: el seguro solo acepta verdadero/falso', 'Valores ambiguos 1, "1" y "si" se rechazan', 'take = 1 | "1" | "si"', { statuses: [400, 400, 400] },
    async (ctx) => { const s = []; for (const take of [1, '1', 'si']) { const p = await partida(ctx, ['0S', 'AH', '7D', '6C']); s.push((await accion(ctx, p.u.token, p.g.id, 'insurance', { take })).status); } return { statuses: s }; }),
  bj('CN-BJ-33', 'VL', 'Regla Charlie: 5 cartas sin pasarse de 21 ganan automáticamente 1 a 1', '2+2+3+4+5 = 16 con 5 cartas', 'pide 3 cartas más', { resultado: 'win', estado: 'finished', cartas: 5, saldo: 10100 },
    async (ctx) => { const p = await partida(ctx, ['2S', '0C', '2H', '8D', '3D', '4C', '5H']); let r; for (let i = 0; i < 3; i++) r = await accion(ctx, p.u.token, p.g.id, 'hit'); return { resultado: r.body.game.result, estado: r.body.game.status, cartas: r.body.game.hands[0].cards.length, saldo: p.saldo() }; }),
  bj('CN-BJ-34', 'VL', 'Regla Charlie: con 4 cartas todavía no aplica', '2+2+3+4 = 11 con 4 cartas sigue en juego', 'pide 2 cartas más', { estado: 'active', cartas: 4 },
    async (ctx) => { const p = await partida(ctx, ['2S', '0C', '2H', '8D', '3D', '4C', '5H']); await accion(ctx, p.u.token, p.g.id, 'hit'); const r = await accion(ctx, p.u.token, p.g.id, 'hit'); return { estado: r.body.game.status, cartas: r.body.game.playerCards.length }; }),

  // ── Apuestas laterales ──
  bj('CN-BJ-35', 'TD', 'Pago: Perfect Pairs par perfecto 25 a 1 (se paga al repartir)', 'K♠ K♠ con 10 de lateral', 'pairsBet=10', { tipo: 'perfect', saldo: 10150 },
    async (ctx) => { const p = await partida(ctx, ['KS', '5H', 'KS', '7D'], { pairsBet: 10 }); return { tipo: p.g.pairsType, saldo: p.saldo() }; }),
  bj('CN-BJ-36', 'TD', 'Pago: 21+3 trío del mismo palo 100 a 1', 'K♠ + K♠ + K♠ visible del crupier con 10 de lateral', 'threeBet=10', { tipo: 'suitedTrips', saldo: 10900 },
    async (ctx) => { const p = await partida(ctx, ['KS', 'KS', 'KS', '5C'], { threeBet: 10 }); return { tipo: p.g.threeType, saldo: p.saldo() }; }),

  // ── Estados de la partida y seguridad ──
  bj('CN-BJ-37', 'TE', 'RN: la carta oculta del crupier y el mazo nunca se envían mientras la mano está activa', 'Respuesta de /start y de /active sin "shoe" ni la 2.ª carta del crupier', 'partida activa', { sinMazo: true, cartaOculta: { hidden: true }, igualEnActive: true },
    async (ctx) => { const p = await partida(ctx, NEUTRO); const a = await ctx.api('GET', '/api/blackjack/active', { token: p.u.token }); return { sinMazo: !JSON.stringify(p.r.body).includes('shoe') && !JSON.stringify(a.body).includes('shoe'), cartaOculta: p.g.dealerCards[1], igualEnActive: JSON.stringify(a.body.game.dealerCards) === JSON.stringify(p.g.dealerCards) }; }),
  bj('CN-BJ-38', 'TE', 'RN: una sola partida activa por jugador (no se cobra dos veces)', 'Empezar con una partida abierta devuelve la misma sin cobrar otra apuesta', 'start dos veces seguidas', { mismaPartida: true, saldo: 9900 },
    async (ctx) => { const p = await partida(ctx, NEUTRO); const r2 = await empezar(ctx, p.u.token, { amount: 100 }); return { mismaPartida: r2.body.game.id === p.g.id, saldo: p.saldo() }; }),
  bj('CN-BJ-39', 'TE', 'Estado: partida terminada → ya no admite acciones', 'Pedir carta después de un blackjack ya cerrado', 'hit sobre partida finished', { status: 404, mensaje: 'No hay una partida activa' },
    async (ctx) => { const p = await partida(ctx, ['AS', '9C', 'KH', '7D']); const r = await accion(ctx, p.u.token, p.g.id, 'hit'); return { status: r.status, mensaje: r.body.message }; }),
  bj('CN-BJ-40', 'TE', 'Estado: una partida es privada del jugador que la abrió', 'Otro jugador intenta pedir carta en mi partida', 'hit con el token de otro usuario', { status: 404 },
    async (ctx) => { const p = await partida(ctx, NEUTRO); const otro = await ctx.usuario(); return { status: (await accion(ctx, otro.token, p.g.id, 'hit')).status }; }),
  bj('CN-BJ-41', 'EP', 'Estado: partida inexistente', 'Id con formato correcto pero inexistente', 'id de 24 hex que no existe', { status: 404 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await accion(ctx, u.token, 'b'.repeat(24), 'stand')).status }; }),
  bj('CN-BJ-42', 'EP', 'RN: un identificador mal formado es un error del cliente (4xx), nunca un error del servidor', 'Id "abc" en la URL', 'POST /api/blackjack/abc/stand', { status: 400 },
    async (ctx) => { const u = await ctx.usuario(); return { status: (await accion(ctx, u.token, 'abc', 'stand')).status }; }),

  // ── Concurrencia: dos peticiones idénticas casi al mismo tiempo (doble clic, red lenta, script) ──
  bj('CN-BJ-43', 'ES', 'RN: una sola partida activa por jugador y una sola apuesta cobrada', 'Dos "start" simultáneos: se cobra una sola apuesta y existe una sola partida', 'Promise.all([start, start]) con apuesta 100', { partidas: 1, apuestasCobradas: 1, saldo: 9900 },
    async (ctx) => { ctx.db.games.clear(); ctx.db.tx.length = 0; const u = await ctx.usuario({ balance: 10000 }); ctx.mazo(...NEUTRO); await Promise.all([empezar(ctx, u.token, { amount: 100 }), empezar(ctx, u.token, { amount: 100 })]); ctx.mazoReal(); return { partidas: ctx.db.games.size, apuestasCobradas: ctx.db.tx.filter((t) => t.user === u.id && t.type === 'bet').length, saldo: ctx.saldo(u.id) }; }),
  bj('CN-BJ-44', 'ES', 'RN: doblar cobra UNA apuesta extra, una sola vez', 'Dos "double" simultáneos sobre la misma mano: solo se cobra un doblado', 'Promise.all([double, double]) con apuesta 100', { cobrosPorDoblar: 1 },
    async (ctx) => { const p = await partida(ctx, ['5S', '0C', '6H', '8D', '0H', '2C']); await Promise.all([accion(ctx, p.u.token, p.g.id, 'double'), accion(ctx, p.u.token, p.g.id, 'double')]); return { cobrosPorDoblar: ctx.db.tx.filter((t) => t.user === p.u.id && t.meta && t.meta.double).length }; }),
  bj('CN-BJ-45', 'ES', 'RN: el seguro se toma una sola vez', 'Dos "insurance take" simultáneos: se cobra un solo seguro', 'Promise.all([insurance, insurance])', { cobrosPorSeguro: 1 },
    async (ctx) => { const p = await partida(ctx, ['0S', 'AH', '7D', '6C']); await Promise.all([accion(ctx, p.u.token, p.g.id, 'insurance', { take: true }), accion(ctx, p.u.token, p.g.id, 'insurance', { take: true })]); return { cobrosPorSeguro: ctx.db.tx.filter((t) => t.user === p.u.id && t.meta && t.meta.insurance).length }; }),
];

module.exports = { nombre: 'api-blackjack', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
