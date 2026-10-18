// CAJA NEGRA · Reglas de negocio puras, probadas solo con entradas y salidas de la especificación (sin mirar el código)
const { card } = require('../helpers');
const rules = require('../../src/services/blackjackRules');
const baccarat = require('../../src/services/baccaratRules');
const roulette = require('../../src/services/rouletteService');
const plinko = require('../../src/services/plinkoService');
const slots = require('../../src/services/slotsService');
const deck = require('../../src/services/cards');
const { weightedPick } = require('../../src/utils/rng');

const u = (modulo) => (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo, regla, objetivo, entrada, esperadoValor, run });
const bj = u('Blackjack (reglas)');
const bc = u('Bacará (reglas)');
const rl = u('Ruleta (reglas)');
const pk = u('Plinko y Tragamonedas (matemática)');
const mz = u('Mazo de cartas');

const c = (v, s = 'SPADES') => card(v, s);
const scripted = (...cs) => { const q = [...cs]; return () => q.shift(); };

const casos = [
  // ───── Blackjack: tabla de pagos (resultado × apuesta) ─────
  ...[
    ['CN-BJR-01', 'blackjack', 100, 250, 'Blackjack natural paga 3 a 2'],
    ['CN-BJR-02', 'win', 100, 200, 'Ganar paga 1 a 1'],
    ['CN-BJR-03', 'push', 100, 100, 'Empate devuelve la apuesta'],
    ['CN-BJR-04', 'lose', 100, 0, 'Perder no devuelve nada'],
    ['CN-BJR-05', 'surrender', 100, 50, 'Rendirse devuelve la mitad'],
    ['CN-BJR-06', 'blackjack', 25, 62, 'Blackjack con apuesta impar redondea hacia abajo (62.5 → 62)'],
    ['CN-BJR-07', 'surrender', 25, 12, 'Rendirse con apuesta impar redondea hacia abajo (12.5 → 12)'],
  ].map(([id, res, bet, pago, obj]) => bj(id, 'TD', 'Tabla de pagos del Blackjack (el pago incluye la apuesta devuelta)', obj, `resultado="${res}", apuesta=${bet}`, pago, () => rules.mainPayout(res, bet))),
  // ───── Blackjack: comparación de manos (valores límite) ─────
  ...[
    ['CN-BJR-08', 21, 20, 'win', 'Jugador 21 vs crupier 20 → gana'],
    ['CN-BJR-09', 20, 20, 'push', 'Jugador 20 vs crupier 20 → empate'],
    ['CN-BJR-10', 20, 21, 'lose', 'Jugador 20 vs crupier 21 → pierde'],
    ['CN-BJR-11', 12, 26, 'win', 'Crupier se pasó (26) → gana el jugador'],
  ].map(([id, p, d, res, obj]) => {
    const mano = (t) => (t === 26 ? [c('KING'), c('6'), c('KING')] : t === 21 ? [c('KING'), c('ACE')] : t === 20 ? [c('KING'), c('QUEEN')] : [c('7'), c('5')]);
    return bj(id, 'VL', 'Gana quien más se acerque a 21 sin pasarse; el que se pasa pierde', obj, `jugador ${p}, crupier ${d}`, res, () => rules.resolveByScores(mano(p), mano(d)));
  }),
  // ───── Blackjack: reglas del crupier ─────
  bj('CN-BJR-12', 'VL', 'El crupier pide con 16 o menos', 'Crupier con 16 debe pedir', 'mano 10+6', true, () => rules.dealerShouldHit([c('KING'), c('6')])),
  bj('CN-BJR-13', 'VL', 'El crupier se planta con 17 o más', 'Crupier con 17 duro no pide', 'mano 10+7', false, () => rules.dealerShouldHit([c('KING'), c('7')])),
  bj('CN-BJR-14', 'VL', 'El crupier se planta en TODOS los 17 (también suave)', 'Crupier con A+6 (17 suave) no pide', 'mano A+6', false, () => rules.dealerShouldHit([c('ACE'), c('6')])),
  bj('CN-BJR-15', 'EP', 'El crupier pide hasta llegar a 17 o más', 'Crupier con 10+2=12 recibe 3 (15) y luego 4 (19) y se planta', 'cartas del mazo: 3, 4', { total: 19, cartas: 4 }, () => { const m = rules.dealerPlay([c('KING'), c('2')], scripted(c('3'), c('4'))); return { total: rules.handScore(m), cartas: m.length }; }),
  bj('CN-BJR-16', 'EP', 'Si el crupier se pasa, deja de pedir', 'Crupier 10+6 recibe un K y se pasa con 26', 'carta del mazo: K', { total: 26, cartas: 3 }, () => { const m = rules.dealerPlay([c('KING'), c('6')], scripted(c('KING'))); return { total: rules.handScore(m), cartas: m.length }; }),
  bj('CN-BJR-17', 'EP', 'Blackjack = 21 con exactamente 2 cartas', 'A+K sí; 7+7+7 (21 con 3 cartas) no; K+Q (20) no', 'tres manos', { AK: true, tresSietes: false, KQ: false }, () => ({ AK: rules.isBlackjack([c('ACE'), c('KING')]), tresSietes: rules.isBlackjack([c('7'), c('7'), c('7')]), KQ: rules.isBlackjack([c('KING'), c('QUEEN')]) })),
  bj('CN-BJR-18', 'TD', 'Bono histórico: A♠ + J♠/J♣ (Jota negra) paga 10 a 1', 'Combinaciones con As de Picas y distintas jotas', 'A♠+J♠ | A♠+J♣ | A♠+J♥ | A♥+J♠ | A♠+K♠', { AS_JS: true, AS_JC: true, AS_JH: false, AH_JS: false, AS_KS: false }, () => ({ AS_JS: rules.isHistoricBlackjack([card('ACE', 'SPADES'), card('JACK', 'SPADES')]), AS_JC: rules.isHistoricBlackjack([card('ACE', 'SPADES'), card('JACK', 'CLUBS')]), AS_JH: rules.isHistoricBlackjack([card('ACE', 'SPADES'), card('JACK', 'HEARTS')]), AH_JS: rules.isHistoricBlackjack([card('ACE', 'HEARTS'), card('JACK', 'SPADES')]), AS_KS: rules.isHistoricBlackjack([card('ACE', 'SPADES'), card('KING', 'SPADES')]) })),
  bj('CN-BJR-19', 'VL', 'El seguro cuesta la mitad de la apuesta (redondeo hacia abajo)', 'Costo del seguro con apuestas 100, 25 y 10', 'apuesta 100 | 25 | 10', { a100: 50, a25: 12, a10: 5 }, () => ({ a100: rules.insuranceCost(100), a25: rules.insuranceCost(25), a10: rules.insuranceCost(10) })),
  bj('CN-BJR-20', 'TD', 'Perfect Pairs: perfecto (mismo valor y palo) · mismo color · mixto · nada', 'Cuatro clases con K♠ de referencia', 'K♠K♠ | K♠K♣ | K♠K♥ | K♠Q♠ | K♠10♠', { perfecto: 'perfect', mismoColor: 'colored', mixto: 'mixed', distintoValor: null, kConDiez: null }, () => ({ perfecto: rules.evaluatePairs([card('KING', 'SPADES'), card('KING', 'SPADES')]), mismoColor: rules.evaluatePairs([card('KING', 'SPADES'), card('KING', 'CLUBS')]), mixto: rules.evaluatePairs([card('KING', 'SPADES'), card('KING', 'HEARTS')]), distintoValor: rules.evaluatePairs([card('KING', 'SPADES'), card('QUEEN', 'SPADES')]), kConDiez: rules.evaluatePairs([card('KING', 'SPADES'), card('10', 'SPADES')]) })),
  bj('CN-BJR-21', 'TD', 'Perfect Pairs paga 25 a 1 / 12 a 1 / 6 a 1 (multiplicador total 26 / 13 / 7)', 'Tabla de multiplicadores', 'PAIRS_PAYOUT', { perfect: 26, colored: 13, mixed: 7 }, () => ({ ...rules.PAIRS_PAYOUT })),
  bj('CN-BJR-22', 'TD', '21+3: combinaciones de póker con tus 2 cartas + la visible del crupier', 'Siete combinaciones representativas', 'ver detalle', { trioMismoPalo: 'suitedTrips', escaleraColor: 'straightFlush', trio: 'threeKind', escalera: 'straight', color: 'flush', nada: null, escaleraDesordenada: 'straight' }, () => {
    const h = (...a) => rules.evaluateTwentyOnePlusThree([card(a[0], a[1]), card(a[2], a[3])], card(a[4], a[5]));
    return { trioMismoPalo: h('7', 'HEARTS', '7', 'HEARTS', '7', 'HEARTS'), escaleraColor: h('4', 'SPADES', '5', 'SPADES', '6', 'SPADES'), trio: h('9', 'SPADES', '9', 'HEARTS', '9', 'DIAMONDS'), escalera: h('3', 'SPADES', '4', 'HEARTS', '5', 'DIAMONDS'), color: h('2', 'SPADES', '7', 'SPADES', '9', 'SPADES'), nada: h('2', 'SPADES', '7', 'HEARTS', '9', 'DIAMONDS'), escaleraDesordenada: h('6', 'SPADES', '4', 'HEARTS', '5', 'DIAMONDS') };
  }),
  bj('CN-BJR-23', 'VL', '21+3: el As cuenta alto o bajo en la escalera, pero no da la vuelta (K-A-2 no sirve)', 'A-2-3, Q-K-A y K-A-2', 'tres escaleras con As', { A23: 'straight', QKA: 'straight', KA2: null }, () => {
    const h = (a, b, d) => rules.evaluateTwentyOnePlusThree([card(a, 'SPADES'), card(b, 'HEARTS')], card(d, 'DIAMONDS'));
    return { A23: h('ACE', '2', '3'), QKA: h('QUEEN', 'KING', 'ACE'), KA2: h('KING', 'ACE', '2') };
  }),
  bj('CN-BJR-24', 'TD', '21+3 paga: trío mismo palo 100 a 1, escalera de color 40 a 1, trío 30 a 1, escalera 10 a 1, color 5 a 1 (multiplicador total +1)', 'Tabla de multiplicadores', 'THREE_PAYOUT', { suitedTrips: 101, straightFlush: 41, threeKind: 31, straight: 11, flush: 6 }, () => ({ ...rules.THREE_PAYOUT })),
  bj('CN-BJR-25', 'TD', 'Charlie: 5 cartas o más sin pasarse de 21', '4 cartas (no), 5 cartas ≤21 (sí), 5 cartas pasadas de 21 (no)', 'tres manos', { cuatro: false, cincoValida: true, cincoPasada: false }, () => ({ cuatro: rules.isCharlie([c('2'), c('2'), c('3'), c('4')]), cincoValida: rules.isCharlie([c('2'), c('2'), c('3'), c('4'), c('5')]), cincoPasada: rules.isCharlie([c('KING'), c('5'), c('4'), c('3'), c('2')]) })),

  // ───── Bacará ─────
  bc('CN-BCR-01', 'TD', 'Valor de las cartas: As=1, 2-9 su número, 10/J/Q/K=0; solo cuenta el último dígito de la suma', 'Totales de manos de ejemplo', '7+8 | 9+9 | K+Q | A+9 | 5+5', { s7_8: 5, s9_9: 8, KQ: 0, A_9: 0, s5_5: 0 }, () => ({ s7_8: baccarat.total([c('7'), c('8')]), s9_9: baccarat.total([c('9'), c('9')]), KQ: baccarat.total([c('KING'), c('QUEEN')]), A_9: baccarat.total([c('ACE'), c('9')]), s5_5: baccarat.total([c('5'), c('5')]) })),
  bc('CN-BCR-02', 'VL', 'El Punto pide con 5 o menos y se planta con 6 o 7', 'Totales 5, 6 y 7 del Punto', 'playerDraws(5|6|7)', { con5: true, con6: false, con7: false }, () => ({ con5: baccarat.playerDraws(5), con6: baccarat.playerDraws(6), con7: baccarat.playerDraws(7) })),
  ...[
    ['CN-BCR-03', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'Banca 0: siempre pide'],
    ['CN-BCR-04', 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'Banca 1: siempre pide'],
    ['CN-BCR-05', 2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'Banca 2: siempre pide'],
    ['CN-BCR-06', 3, [0, 1, 2, 3, 4, 5, 6, 7, 9], 'Banca 3: pide salvo que la 3.ª del Punto sea 8'],
    ['CN-BCR-07', 4, [2, 3, 4, 5, 6, 7], 'Banca 4: pide si la 3.ª del Punto es 2 a 7'],
    ['CN-BCR-08', 5, [4, 5, 6, 7], 'Banca 5: pide si la 3.ª del Punto es 4 a 7'],
    ['CN-BCR-09', 6, [6, 7], 'Banca 6: pide si la 3.ª del Punto es 6 o 7'],
    ['CN-BCR-10', 7, [], 'Banca 7: nunca pide'],
  ].map(([id, total, pideCon, obj]) => bc(id, 'TD', 'Tabla oficial de la tercera carta de la Banca', obj, `Banca=${total}; 3.ª carta del Punto = 0…9 (10 casos)`, { pideConTerceraCarta: pideCon },
    () => { const pide = []; for (let p = 0; p <= 9; p++) { const carta = p === 0 ? c('KING') : c(String(p)); if (baccarat.bankerDraws(total, carta)) pide.push(p); } return { pideConTerceraCarta: pide }; })),
  bc('CN-BCR-11', 'VL', 'Si el Punto se plantó, la Banca pide con 5 o menos y se planta con 6 o más', 'Banca 5 y Banca 6 sin tercera carta del Punto', 'bankerDraws(5|6, null)', { con5: true, con6: false }, () => ({ con5: baccarat.bankerDraws(5, null), con6: baccarat.bankerDraws(6, null) })),
  bc('CN-BCR-12', 'TD', 'Pagos: Punto 1 a 1; Banca 1 a 1 menos 5%; Empate 8 a 1; Pares 11 a 1', 'Ronda donde gana la Banca, con apuestas 100 en cada casilla', 'ganador=banker, par de la banca', { player: 0, banker: 195, tie: 0, playerPair: 0, bankerPair: 1200 }, () => baccarat.settle({ player: 100, banker: 100, tie: 100, playerPair: 100, bankerPair: 100 }, { winner: 'banker', playerPair: false, bankerPair: true })),
  bc('CN-BCR-13', 'TD', 'Empate: Punto y Banca se devuelven; el Empate paga 8 a 1 (9× total)', 'Ronda empatada, apuestas 100 en Punto, Banca y Empate', 'ganador=tie', { player: 100, banker: 100, tie: 900, playerPair: 0, bankerPair: 0 }, () => baccarat.settle({ player: 100, banker: 100, tie: 100 }, { winner: 'tie', playerPair: false, bankerPair: false })),
  bc('CN-BCR-14', 'VL', 'La comisión del 5% se redondea hacia abajo', 'Gana la Banca con apuestas de 10 y de 11', 'banker=10 → 19 · banker=11 → 21', { b10: 19, b11: 21 }, () => ({ b10: baccarat.settle({ banker: 10 }, { winner: 'banker' }).banker, b11: baccarat.settle({ banker: 11 }, { winner: 'banker' }).banker })),
  bc('CN-BCR-15', 'TD', 'Gana el Punto: paga 1 a 1; la Banca y el Empate pierden', 'Ronda con victoria del Punto', 'ganador=player', { player: 200, banker: 0, tie: 0 }, () => { const r = baccarat.settle({ player: 100, banker: 100, tie: 100 }, { winner: 'player' }); return { player: r.player, banker: r.banker, tie: r.tie }; }),

  // ───── Ruleta ─────
  rl('CN-RLR-01', 'TD', 'Ruleta europea: 18 rojos, 18 negros y 1 verde (el 0)', 'Colores de los 37 números', 'colorOf(0..36)', { rojos: 18, negros: 18, verdes: 1, colorDel0: 'green', colorDel1: 'red', colorDel2: 'black', colorDel36: 'red' }, () => { const col = Array.from({ length: 37 }, (_, n) => roulette.colorOf(n)); return { rojos: col.filter((x) => x === 'red').length, negros: col.filter((x) => x === 'black').length, verdes: col.filter((x) => x === 'green').length, colorDel0: col[0], colorDel1: col[1], colorDel2: col[2], colorDel36: col[36] }; }),
  rl('CN-RLR-02', 'TD', 'Multiplicadores totales: pleno 36, simples 2, docena y columna 3', 'Tabla de pagos', 'PAYOUTS', { straight: 36, color: 2, parity: 2, half: 2, dozen: 3, column: 3 }, () => ({ ...roulette.PAYOUTS })),
  rl('CN-RLR-03', 'EP', 'El sorteo es justo: los 37 números salen con la misma probabilidad (1/37)', '37,000 giros: cada número debe salir entre 850 y 1,150 veces (esperado 1,000)', 'spinNumber() × 37,000', { fueraDeRango: 0, cubreLos37: true }, () => { const n = Array(37).fill(0); for (let i = 0; i < 37000; i++) n[roulette.spinNumber()]++; return { fueraDeRango: n.filter((x) => x < 850 || x > 1150).length, cubreLos37: n.every((x) => x > 0) }; }),
  rl('CN-RLR-04', 'TD', 'Validación de apuestas sueltas (mesa en vivo): se acepta lo válido y se rechaza lo inválido con error 400', 'Válida, monto 9, tipo malo y selección fuera de rango', 'normalizeBet(...) × 4', { valida: 'straight|17|50', monto9: 400, tipoMalo: 400, seleccion37: 400 }, () => {
    const err = (f) => { try { f(); return 'no falló'; } catch (e) { return e.status; } };
    const ok = roulette.normalizeBet({ betType: 'straight', selection: '17', amount: 50 });
    return { valida: `${ok.betType}|${ok.selection}|${ok.amount}`, monto9: err(() => roulette.normalizeBet({ betType: 'color', selection: 'red', amount: 9 })), tipoMalo: err(() => roulette.normalizeBet({ betType: 'x', selection: 1, amount: 10 })), seleccion37: err(() => roulette.normalizeBet({ betType: 'straight', selection: 37, amount: 10 })) };
  }),
  rl('CN-RLR-05', 'EP', 'Una selección vacía o nula NO es el número 0 (mesa en vivo)', 'normalizeBet con selection null, "" y [] debe lanzar error 400', 'straight con null | "" | []', { nulo: 400, vacio: 400, lista: 400 }, () => {
    const err = (s) => { try { roulette.normalizeBet({ betType: 'straight', selection: s, amount: 10 }); return 'aceptó la apuesta'; } catch (e) { return e.status; } };
    return { nulo: err(null), vacio: err(''), lista: err([]) };
  }),

  // ───── Plinko y Tragamonedas: matemática del juego ─────
  pk('CN-MAT-01', 'TD', 'Plinko: retorno esperado (RTP) ≈ 97% en los 3 niveles de riesgo', 'RTP exacto de bajo, medio y alto', 'expectedReturn(low|medium|high)', { low: true, medium: true, high: true }, () => ({ low: Math.abs(plinko.expectedReturn('low') - 0.97) < 0.01, medium: Math.abs(plinko.expectedReturn('medium') - 0.97) < 0.01, high: Math.abs(plinko.expectedReturn('high') - 0.97) < 0.01 })),
  pk('CN-MAT-02', 'EP', 'Plinko: 13 casillas simétricas por nivel', 'Cada tabla tiene 13 valores y es igual leída al revés', 'MULTIPLIERS', { low: true, medium: true, high: true }, () => Object.fromEntries(plinko.RISKS.map((r) => [r, plinko.MULTIPLIERS[r].length === 13 && plinko.MULTIPLIERS[r].every((m, i, a) => m === a[12 - i])]))),
  pk('CN-MAT-03', 'VL', 'Plinko: la casilla es la cantidad de pasos a la derecha (0 a 12)', 'Todo izquierda → 0; todo derecha → 12; mitad y mitad → 6', 'slotOf(...)', { izquierda: 0, derecha: 12, mitad: 6 }, () => ({ izquierda: plinko.slotOf(Array(12).fill(0)), derecha: plinko.slotOf(Array(12).fill(1)), mitad: plinko.slotOf([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]) })),
  pk('CN-MAT-04', 'EP', 'Tragamonedas: la casa gana a largo plazo (retorno de líneas entre 80% y 90%)', '300,000 giros de 100: retorno promedio de las líneas', 'spin(100) × 300,000', { enRango: true }, () => { let t = 0; const n = 300000; for (let i = 0; i < n; i++) t += slots.spin(100).winAmount; const rtp = t / n / 100; return { enRango: rtp > 0.8 && rtp < 0.9 }; }),
  pk('CN-MAT-05', 'EP', 'Sorteo ponderado: cada símbolo sale según su peso (34/27/19/11/6/3 %)', '100,000 sorteos: cada frecuencia dentro de ±1.5 puntos del peso', 'weightedPick(símbolos) × 100,000', { todasEnRango: true }, () => {
    const items = [{ n: 'a', w: 34 }, { n: 'b', w: 27 }, { n: 'c', w: 19 }, { n: 'd', w: 11 }, { n: 'e', w: 6 }, { n: 'f', w: 3 }];
    const cont = {}; const N = 100000; for (let i = 0; i < N; i++) { const k = weightedPick(items).n; cont[k] = (cont[k] || 0) + 1; }
    return { todasEnRango: items.every((i) => Math.abs((cont[i.n] / N) * 100 - i.w) < 1.5) };
  }),

  // ───── Mazo de cartas ─────
  mz('CN-DCK-01', 'VL', 'Un mazo de Blackjack son 6 barajas (312 cartas); el de Bacará, 8 (416)', 'Tamaño de los zapatos', 'buildShoe(6) y buildShoe(8)', { seis: 312, ocho: 416 }, () => ({ seis: deck.buildShoe(6).length, ocho: deck.buildShoe(8).length })),
  mz('CN-DCK-02', 'EP', 'Cada una de las 52 cartas aparece exactamente una vez por baraja', 'En 6 barajas, cada código sale 6 veces', 'conteo por código', { codigosDistintos: 52, todosSeis: true }, () => { const m = new Map(); deck.buildShoe(6).forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return { codigosDistintos: m.size, todosSeis: [...m.values()].every((n) => n === 6) }; }),
  mz('CN-DCK-03', 'EP', 'El mazo está barajado (no sale en orden)', 'Dos mazos barajados distintos entre sí y distintos del orden de fábrica', 'buildShoe(1) dos veces', { distintos: true }, () => { const a = deck.buildShoe(1).join(); const b = deck.buildShoe(1).join(); const orden = deck.buildShoe(1, (n) => n - 1).join(); return { distintos: a !== b && a !== orden }; }),
  mz('CN-DCK-04', 'TD', 'Sacar cartas las quita del frente del mazo y las devuelve completas', 'draw(mazo, 2) sobre ["AS","0H","KD"]', 'draw(["AS","0H","KD"], 2)', { sacadas: ['AS', '0H'], valorDeLaSegunda: '10', quedan: ['KD'] }, () => { const m = ['AS', '0H', 'KD']; const s = deck.draw(m, 2); return { sacadas: s.map((x) => x.code), valorDeLaSegunda: s[1].value, quedan: m }; }),
  mz('CN-DCK-05', 'VL', 'Pedir más cartas de las que hay es un error controlado', 'draw de 2 cartas con 1 sola en el mazo', 'draw(["AS"], 2)', { estado: 500, mensaje: 'El mazo se quedó sin cartas' }, () => { try { deck.draw(['AS'], 2); return 'sin error'; } catch (e) { return { estado: e.status, mensaje: e.message }; } }),
  mz('CN-DCK-06', 'EP', 'Un código de carta inválido se rechaza', 'fromCode("ZZ")', 'código inexistente', { lanza: true }, () => { try { deck.fromCode('ZZ'); return { lanza: false }; } catch { return { lanza: true }; } }),
];

module.exports = { nombre: 'unidad', casos };
