// CATÁLOGO DE PRUEBAS DE CAJA BLANCA
// Cada caso se diseñó leyendo el CÓDIGO (grafo de flujo, condiciones, caminos). El valor esperado sale de la
// regla de negocio, NO de ejecutar el código.
// Códigos de cobertura:  S = sentencia · D = decisión · C = condición simple · MC = condición múltiple · P = camino
const crypto = require('node:crypto');
const { card } = require('../helpers');
const { weightedPick } = require('../../src/utils/rng');
const { calculateVipLevel } = require('../../src/utils/vip');
const rules = require('../../src/services/blackjackRules');
const baccarat = require('../../src/services/baccaratRules');
const { settleBets } = require('../../src/services/rouletteService');

// Reemplaza temporalmente el sorteo criptográfico por valores fijos (mock), como hizo el equipo en su primer avance.
const conSorteo = (valores, fn) => {
  const original = crypto.randomInt;
  const cola = [].concat(valores);
  crypto.randomInt = () => (cola.length > 1 ? cola.shift() : cola[0]);
  try { return fn(); } finally { crypto.randomInt = original; }
};

const A = (value) => card(value, 'SPADES');
const pick = (items, r) => { const x = conSorteo(r, () => weightedPick(items)); return x === undefined ? undefined : x.nombre; };

const FRUTAS = [{ nombre: 'Cereza', w: 50 }, { nombre: 'Jackpot', w: 10 }];

// ───────────────────────── 1. weightedPick (src/utils/rng.js) ─────────────────────────
const rng = [
  { id: 'CB-RNG-01', objetivo: 'Salida rápida: el ciclo entra y el if se cumple en la 1.ª vuelta', entrada: 'items=[Cereza w50, Jackpot w10], r=20', camino: 'Inicio→N1→N2(Sí)→N3(True)→N4→Fin', cubre: ['S', 'D', 'P'], condiciones: 'for=Sí, if=True', esperadoValor: 'Cereza', run: () => pick(FRUTAS, 20) },
  { id: 'CB-RNG-02', objetivo: 'Resta de peso y gana en la 2.ª vuelta', entrada: 'items=[Cereza w50, Jackpot w10], r=55', camino: 'Inicio→N1→N2(Sí)→N3(False)→N5→N2(Sí)→N3(True)→N4→Fin', cubre: ['S', 'D', 'P'], condiciones: 'if=False y luego True', esperadoValor: 'Jackpot', run: () => pick(FRUTAS, 55) },
  { id: 'CB-RNG-03', objetivo: 'Retorno de seguridad (failsafe): el ciclo termina sin ganar', entrada: 'items=[Cereza w50, Jackpot w10], r=100 (valor imposible inyectado)', camino: 'Inicio→N1→N2(Sí)→N3(F)→N5→N2(Sí)→N3(F)→N5→N2(No)→N6→Fin', cubre: ['S', 'D', 'P'], condiciones: 'for=No', esperadoValor: 'Jackpot', run: () => pick(FRUTAS, 100) },
  { id: 'CB-RNG-04', objetivo: 'Ciclo con 0 iteraciones (lista vacía) va directo al retorno de seguridad', entrada: 'items=[], r=0', camino: 'Inicio→N1→N2(No)→N6→Fin', cubre: ['P'], condiciones: 'for=No desde el inicio', esperadoValor: undefined, run: () => pick([], 0) },
  { id: 'CB-RNG-05', objetivo: 'Límite superior del primer ítem: r=49 (< 50) todavía gana Cereza', entrada: 'items=[Cereza w50, Jackpot w10], r=49', camino: 'Inicio→N1→N2→N3(True)→N4→Fin', cubre: ['D'], condiciones: 'if: 49<50 = True', esperadoValor: 'Cereza', run: () => pick(FRUTAS, 49) },
  { id: 'CB-RNG-06', objetivo: 'Límite: r=50 ya NO es del primer ítem (50<50 es falso) y pasa al Jackpot', entrada: 'items=[Cereza w50, Jackpot w10], r=50', camino: 'Inicio→N1→N2→N3(False)→N5→N2→N3(True)→N4→Fin', cubre: ['D'], condiciones: 'if: 50<50 = False; luego 0<10 = True', esperadoValor: 'Jackpot', run: () => pick(FRUTAS, 50) },
  { id: 'CB-RNG-07', objetivo: 'Una sola opción: con el sorteo real siempre devuelve esa opción', entrada: 'items=[Unico w5], sorteo real', camino: 'Inicio→N1→N2→N3(True)→N4→Fin', cubre: ['S'], condiciones: 'r=0 siempre', esperadoValor: 'Unico', run: () => weightedPick([{ nombre: 'Unico', w: 5 }]).nombre },
  { id: 'CB-RNG-08', objetivo: 'Tres opciones: el peso restado debe acumularse bien (r=60 cae en la 2.ª, no en la última). Caso agregado tras la prueba de mutación', entrada: 'items=[A w50, B w30, C w20], r=60', camino: 'Inicio→N1→N2→N3(F)→N5→N2→N3(V)→N4→Fin', cubre: ['D', 'P'], condiciones: 'if: 60<50=F; 10<30=V', esperadoValor: 'B', run: () => pick([{ nombre: 'A', w: 50 }, { nombre: 'B', w: 30 }, { nombre: 'C', w: 20 }], 60) },
];

// ───────────────────────── 2. calculateVipLevel (src/utils/vip.js) ─────────────────────────
const vip = (n) => calculateVipLevel(n);
const vipCases = [
  ['CB-VIP-01', 'Camino VIP: total muy alto', 60000, 'VIP LUCK.IO', 'N1(V)→N2', ['S', 'D', 'C', 'P']],
  ['CB-VIP-02', 'Límite exacto 50,000 ya es VIP (>=)', 50000, 'VIP LUCK.IO', 'N1(V)→N2', ['D']],
  ['CB-VIP-03', 'Límite 49,999 todavía es Oro', 49999, 'Oro', 'N1(F)→N3(V)→N4', ['D']],
  ['CB-VIP-04', 'Camino Oro: total intermedio', 25000, 'Oro', 'N1(F)→N3(V)→N4', ['S', 'D', 'C', 'P']],
  ['CB-VIP-05', 'Límite exacto 20,000 ya es Oro', 20000, 'Oro', 'N1(F)→N3(V)→N4', ['D']],
  ['CB-VIP-06', 'Límite 19,999 todavía es Plata', 19999, 'Plata', 'N1(F)→N3(F)→N5(V)→N6', ['D']],
  ['CB-VIP-07', 'Camino Plata: total intermedio', 7000, 'Plata', 'N1(F)→N3(F)→N5(V)→N6', ['S', 'D', 'C', 'P']],
  ['CB-VIP-08', 'Límite exacto 5,000 ya es Plata', 5000, 'Plata', 'N1(F)→N3(F)→N5(V)→N6', ['D']],
  ['CB-VIP-09', 'Límite 4,999 sigue en Bronce', 4999, 'Bronce', 'N1(F)→N3(F)→N5(F)→N7', ['D']],
  ['CB-VIP-10', 'Camino Bronce: usuario nuevo sin apuestas', 0, 'Bronce', 'N1(F)→N3(F)→N5(F)→N7', ['S', 'D', 'C', 'P']],
].map(([id, objetivo, n, esperadoValor, camino, cubre]) => ({ id, objetivo, entrada: `totalWagered = ${n}`, camino: `Inicio→${camino}→Fin`, cubre, condiciones: 'una sola condición por decisión', esperadoValor, run: () => vip(n) }));

// ───────────────────────── 3. handScore + cardValue (src/services/blackjackRules.js) ─────────────────────────
const score = (...cs) => rules.handScore(cs);
const handScore = [
  { id: 'CB-HS-01', objetivo: 'Mano vacía: el for no entra (0 iteraciones) y el while no se evalúa a verdadero', entrada: '[]', camino: 'Inicio→N1→N2(No)→N6(F)→N9→Fin', cubre: ['P'], condiciones: 'A(total>21)=F, B(aces>0)=F', esperadoValor: 0, run: () => score() },
  { id: 'CB-HS-02', objetivo: 'Dos cartas sin As: suma simple', entrada: '7♠ 5♠', camino: 'N2(Sí)→N3→N4(F)→N2…→N6(F)→N9', cubre: ['S', 'D', 'C', 'MC'], condiciones: 'A=F, B=F', esperadoValor: 12, run: () => score(A('7'), A('5')) },
  { id: 'CB-HS-03', objetivo: 'As + 6 = 17 suave: el As cuenta 11 y no hay que ajustar', entrada: 'A♠ 6♠', camino: 'N4(V)→N5→N2…→N6(F)→N9', cubre: ['MC', 'C'], condiciones: 'A=F, B=V (aces=1)', esperadoValor: 17, run: () => score(A('ACE'), A('6')) },
  { id: 'CB-HS-04', objetivo: 'As + 6 + 9 = 26: el As baja de 11 a 1 (1 vuelta del while)', entrada: 'A♠ 6♠ 9♠', camino: '…N6(V)→N7(V)→N8→N6(F)→N9', cubre: ['S', 'D', 'C', 'MC', 'P'], condiciones: 'A=V,B=V y luego A=F', esperadoValor: 16, run: () => score(A('ACE'), A('6'), A('9')) },
  { id: 'CB-HS-05', objetivo: 'Se pasa de 21 sin ningún As: no hay nada que ajustar', entrada: 'K♠ 9♠ 5♠', camino: '…N6(V)→N7(F)→N9', cubre: ['C', 'MC', 'P'], condiciones: 'A=V, B=F', esperadoValor: 24, run: () => score(A('KING'), A('9'), A('5')) },
  { id: 'CB-HS-06', objetivo: 'Dos Ases + 9: solo un As baja a 1 y se queda en 21', entrada: 'A♠ A♠ 9♠', camino: '…N6(V)→N7(V)→N8→N6(F)→N9', cubre: ['P'], condiciones: 'A=V,B=V y luego A=F', esperadoValor: 21, run: () => score(A('ACE'), A('ACE'), A('9')) },
  { id: 'CB-HS-07', objetivo: 'While con 2 vueltas: dos Ases bajan a 1', entrada: 'A♠ A♠ K♠ 5♠', camino: '…(N6→N7→N8)×2→N6(F)→N9', cubre: ['P'], condiciones: 'A=V,B=V ×2, luego A=F', esperadoValor: 17, run: () => score(A('ACE'), A('ACE'), A('KING'), A('5')) },
  { id: 'CB-HS-08', objetivo: 'Blackjack natural A+K = 21 (valor de figuras en cardValue)', entrada: 'A♠ K♠', camino: 'N4(V)→…→N6(F)→N9', cubre: ['S'], condiciones: 'cardValue: ACE y figura', esperadoValor: 21, run: () => score(A('ACE'), A('KING')) },
  { id: 'CB-HS-09', objetivo: 'Figuras J y Q valen 10 cada una (ramas de cardValue)', entrada: 'J♠ Q♠', camino: 'N2→N3→…→N9', cubre: ['D'], condiciones: 'cardValue: JACK, QUEEN', esperadoValor: 20, run: () => score(A('JACK'), A('QUEEN')) },
  { id: 'CB-HS-10', objetivo: 'El "10" se escribe como texto y también vale 10 (rama numérica de cardValue)', entrada: '10♠ 5♠', camino: 'N2→N3→…→N9', cubre: ['D'], condiciones: 'cardValue: Number("10")', esperadoValor: 15, run: () => score(A('10'), A('5')) },
  { id: 'CB-HS-11', objetivo: 'Cinco Ases: el while corre 4 veces y se detiene en 15 (prueba del ciclo n veces)', entrada: 'A♠ ×5', camino: '…(N6→N7→N8)×4→N6(F)→N9', cubre: ['P'], condiciones: 'bucle while 4 iteraciones', esperadoValor: 15, run: () => score(A('ACE'), A('ACE'), A('ACE'), A('ACE'), A('ACE')) },
];

// ───────────────────────── 4. canSplit (src/services/blackjackRules.js) ─────────────────────────
const mano = (v1, v2, extra = {}) => ({ cards: [A(v1), A(v2)], ...extra });
const split = (hand, count) => rules.canSplit(hand, count);
const canSplit = [
  { id: 'CB-SP-01', objetivo: 'C1 falsa: no hay mano', entrada: 'hand=null, handCount=1', camino: 'C1(F)→N6', cubre: ['D', 'C', 'MC'], condiciones: 'C1=F', esperadoValor: false, run: () => split(null, 1) },
  { id: 'CB-SP-02', objetivo: 'C2 falsa: la mano tiene 3 cartas', entrada: '8♠ 8♠ 2♠, handCount=1', camino: 'C1(V)→C2(F)→N6', cubre: ['C', 'MC'], condiciones: 'C1=V, C2=F', esperadoValor: false, run: () => split({ cards: [A('8'), A('8'), A('2')] }, 1) },
  { id: 'CB-SP-03', objetivo: 'C3 falsa: dos cartas de distinto valor', entrada: '8♠ 9♠, handCount=1', camino: 'C1(V)→C2(V)→C3(F)→N6', cubre: ['C', 'MC'], condiciones: 'C1=V, C2=V, C3=F', esperadoValor: false, run: () => split(mano('8', '9'), 1) },
  { id: 'CB-SP-04', objetivo: 'C4 falsa (límite): ya hay 4 manos, no se puede dividir más', entrada: '8♠ 8♠, handCount=4', camino: 'C1(V)→C2(V)→C3(V)→C4(F)→N6', cubre: ['C', 'MC'], condiciones: 'C1,C2,C3=V, C4=F', esperadoValor: false, run: () => split(mano('8', '8'), 4) },
  { id: 'CB-SP-05', objetivo: 'C5 falsa: la mano viene de dividir Ases (no se re-divide)', entrada: 'A♠ A♠ con splitAce=true, handCount=2', camino: 'C1..C4(V)→N5 (C5 falsa: devuelve false)', cubre: ['C', 'MC'], condiciones: 'C1..C4=V, C5=F', esperadoValor: false, run: () => split(mano('ACE', 'ACE', { splitAce: true }), 2) },
  { id: 'CB-SP-06', objetivo: 'Todas verdaderas: par de 8 con 1 sola mano', entrada: '8♠ 8♠, handCount=1', camino: 'C1..C4(V)→N5 (C5 verdadera: devuelve true)', cubre: ['S', 'D', 'C', 'MC', 'P'], condiciones: 'C1..C5=V', esperadoValor: true, run: () => split(mano('8', '8'), 1) },
  { id: 'CB-SP-07', objetivo: 'K y Q valen 10 los dos: se pueden dividir aunque sean figuras distintas', entrada: 'K♠ Q♠, handCount=1', camino: 'C1..C4(V)→N5 (C5 verdadera: devuelve true)', cubre: ['C'], condiciones: 'C3: 10 === 10', esperadoValor: true, run: () => split(mano('KING', 'QUEEN'), 1) },
  { id: 'CB-SP-08', objetivo: 'Límite: con 3 manos aún se puede (3 < 4)', entrada: '8♠ 8♠, handCount=3', camino: 'C1..C4(V)→N5 (C5 verdadera: devuelve true)', cubre: ['C'], condiciones: 'C4: 3<4 = V', esperadoValor: true, run: () => split(mano('8', '8'), 3) },
  { id: 'CB-SP-09', objetivo: 'Par de Ases en la primera división sí se permite (splitAce no definido)', entrada: 'A♠ A♠, handCount=1', camino: 'C1..C4(V)→N5 (C5 verdadera: devuelve true)', cubre: ['C'], condiciones: 'C5: !undefined = V', esperadoValor: true, run: () => split(mano('ACE', 'ACE'), 1) },
];

// ───────────────────────── 5. bankerDraws (src/services/baccaratRules.js) ─────────────────────────
const bd = (total, third) => baccarat.bankerDraws(total, third === null ? null : A(third));
const bankerCases = [
  ['CB-BD-01', 'El Punto se plantó (sin 3.ª carta) y la Banca tiene 5: pide', 5, null, true, 'N1(V)→N2→Fin', ['S', 'D', 'C'], '!playerThird=V'],
  ['CB-BD-02', 'El Punto se plantó y la Banca tiene 6: se planta', 6, null, false, 'N1(V)→N2→Fin', ['C'], '!playerThird=V; 6<=5=F'],
  ['CB-BD-03', 'Banca 0 siempre pide (case 0)', 0, '9', true, 'N1(F)→N3→N4(V)→N11→Fin', ['S', 'D', 'P'], 'case 0'],
  ['CB-BD-04', 'Banca 1 siempre pide (case 1)', 1, '5', true, 'N1(F)→N3→N4(F)→N5(V)→N11', ['D', 'P'], 'case 1'],
  ['CB-BD-05', 'Banca 2 siempre pide (case 2)', 2, '8', true, 'N1(F)→N3→…→N6(V)→N11', ['D', 'P'], 'case 2'],
  ['CB-BD-06', 'Banca 3 NO pide si la 3.ª del Punto es 8', 3, '8', false, 'N7(V)→N12→Fin', ['S', 'D', 'P'], 'case 3: p!==8 = F'],
  ['CB-BD-07', 'Banca 3 pide si la 3.ª del Punto es 7', 3, '7', true, 'N7(V)→N12→Fin', ['D'], 'case 3: p!==8 = V'],
  ['CB-BD-08', 'Banca 4 NO pide si la 3.ª del Punto es As (p=1)', 4, 'ACE', false, 'N8(V)→N13(F)→N19', ['D', 'C', 'MC', 'P'], 'A4: p>=2 = F'],
  ['CB-BD-09', 'Banca 4 pide con 3.ª del Punto = 2 (límite inferior)', 4, '2', true, 'N8(V)→N13(V)→N14', ['S', 'D', 'C', 'MC', 'P'], 'A4=V, B4: 2<=7 = V'],
  ['CB-BD-10', 'Banca 4 NO pide con 3.ª del Punto = 8', 4, '8', false, 'N8(V)→N13(V)→N14→Fin', ['C', 'MC'], 'A4=V, B4: 8<=7 = F'],
  ['CB-BD-11', 'Banca 4 NO pide si la 3.ª del Punto vale 0 (figura K)', 4, 'KING', false, 'N8(V)→N13(F)→N19', ['C'], 'p=0: A4=F'],
  ['CB-BD-12', 'Banca 5 NO pide con 3.ª del Punto = 3', 5, '3', false, 'N9(V)→N15(F)→N19', ['D', 'C', 'MC', 'P'], 'A5: p>=4 = F'],
  ['CB-BD-13', 'Banca 5 pide con 3.ª del Punto = 4 (límite inferior)', 5, '4', true, 'N9(V)→N15(V)→N16', ['S', 'D', 'C', 'MC', 'P'], 'A5=V, B5=V'],
  ['CB-BD-14', 'Banca 5 NO pide con 3.ª del Punto = 8', 5, '8', false, 'N9(V)→N15(V)→N16→Fin', ['C', 'MC'], 'A5=V, B5: 8<=7 = F'],
  ['CB-BD-15', 'Banca 6 pide con 3.ª = 6 (primera condición del OR verdadera)', 6, '6', true, 'N10(V)→N17(V)→N20→Fin', ['S', 'D', 'C', 'MC', 'P'], 'p===6 = V (cortocircuito)'],
  ['CB-BD-16', 'Banca 6 pide con 3.ª = 7 (solo la 2.ª condición del OR)', 6, '7', true, 'N10(V)→N17(F)→N18→Fin', ['C', 'MC', 'P'], 'p===6 = F, p===7 = V'],
  ['CB-BD-17', 'Banca 6 NO pide con 3.ª = 5 (ambas condiciones del OR falsas)', 6, '5', false, 'N10(V)→N17(F)→N18→Fin', ['C', 'MC'], 'p===6 = F, p===7 = F'],
  ['CB-BD-18', 'Banca 7 siempre se planta (default del switch)', 7, '2', false, 'N10(F)→N19→Fin', ['S', 'D', 'P'], 'default'],
].map(([id, objetivo, total, third, esperadoValor, camino, cubre, condiciones]) => ({ id, objetivo, entrada: `bankerTotal=${total}, terceraCartaPunto=${third === null ? 'ninguna' : third}`, camino: `Inicio→${camino}`, cubre, condiciones, esperadoValor, run: () => bd(total, third) }));

// ───────────────────────── 6. settleBets / matches (src/services/rouletteService.js) ─────────────────────────
const liquidar = (bets, number, hot = []) => {
  const r = settleBets(bets, number, hot);
  return { totalWin: r.totalWin, pagos: r.results.map((x) => [x.won, x.winAmount, x.laPartage, x.isHot]) };
};
const b = (betType, selection, amount) => ({ betType, selection, amount });
const roulette = [
  { id: 'CB-RL-01', objetivo: 'Sin apuestas: el map no itera (0 iteraciones) y el total es 0', entrada: 'bets=[], número=7', camino: 'Inicio→…→Fin (sin entrar al callback)', cubre: ['P'], condiciones: 'map: 0 iteraciones', esperadoValor: { totalWin: 0, pagos: [] }, run: () => liquidar([], 7) },
  { id: 'CB-RL-02', objetivo: 'Pleno gana sin números calientes: paga 36× (35 a 1 + apuesta)', entrada: 'pleno 17 por 100, sale 17, calientes=[]', camino: 'A(V)→HB(F: some vacío)→won(V)→M(F)→N5→Ret', cubre: ['S', 'D', 'C', 'MC', 'P'], condiciones: 'A=V, B=F, won=V, isHot=F', esperadoValor: { totalWin: 3600, pagos: [[true, 3600, 0, false]] }, run: () => liquidar([b('straight', 17, 100)], 17, []) },
  { id: 'CB-RL-03', objetivo: 'Pleno gana y el 17 es número caliente: bono +50%', entrada: 'pleno 17 por 100, sale 17, calientes=[17]', camino: 'A(V)→HB(V)→won(V)→M(V)→N5→Ret', cubre: ['S', 'D', 'C', 'MC', 'P'], condiciones: 'A=V, B=V, won=V, isHot=V', esperadoValor: { totalWin: 5400, pagos: [[true, 5400, 0, true]] }, run: () => liquidar([b('straight', 17, 100)], 17, [{ number: 17, hits: 9 }]) },
  { id: 'CB-RL-04', objetivo: 'Pleno gana; hay calientes pero NINGUNO es el número que salió (B falsa con lista no vacía)', entrada: 'pleno 17 por 100, sale 17, calientes=[5]', camino: 'A(V)→HB(F)→won(V)→M(F)', cubre: ['C', 'MC'], condiciones: 'A=V, B=F (some recorre y no encuentra)', esperadoValor: { totalWin: 3600, pagos: [[true, 3600, 0, false]] }, run: () => liquidar([b('straight', 17, 100)], 17, [{ number: 5, hits: 8 }]) },
  { id: 'CB-RL-05', objetivo: 'Rojo con el 0: La Partage devuelve la mitad', entrada: 'rojo por 100, sale 0', camino: 'A(F)→won(F)→C(V)→D(V)→N7→Ret', cubre: ['S', 'D', 'C', 'MC', 'P'], condiciones: 'A=F, won=F, C(número===0)=V, D(simple)=V', esperadoValor: { totalWin: 50, pagos: [[false, 0, 50, false]] }, run: () => liquidar([b('color', 'red', 100)], 0) },
  { id: 'CB-RL-06', objetivo: 'Rojo pierde con un número negro (sin La Partage)', entrada: 'rojo por 100, sale 2', camino: 'A(F)→won(F)→C(F)→Ret', cubre: ['D', 'C', 'MC'], condiciones: 'won=F, C=F', esperadoValor: { totalWin: 0, pagos: [[false, 0, 0, false]] }, run: () => liquidar([b('color', 'red', 100)], 2) },
  { id: 'CB-RL-07', objetivo: 'Docena con el 0: pierde todo (La Partage solo aplica a apuestas simples)', entrada: 'docena 1 por 100, sale 0', camino: 'A(F)→won(F)→C(V)→D(F)→Ret', cubre: ['C', 'MC'], condiciones: 'C=V, D=F', esperadoValor: { totalWin: 0, pagos: [[false, 0, 0, false]] }, run: () => liquidar([b('dozen', 1, 100)], 0) },
  { id: 'CB-RL-08', objetivo: 'Pleno al 0 gana normal (el 0 es un número más para apuestas directas)', entrada: 'pleno 0 por 100, sale 0', camino: 'A(V)→…→won(V)', cubre: ['C'], condiciones: 'matches(straight): 0===0', esperadoValor: { totalWin: 3600, pagos: [[true, 3600, 0, false]] }, run: () => liquidar([b('straight', 0, 100)], 0) },
  { id: 'CB-RL-09', objetivo: 'Pleno perdedor con el 0: no hay La Partage y no paga nada', entrada: 'pleno 5 por 100, sale 0', camino: 'A(V)→HB(F)→won(F)→C(V)→D(F)→Ret', cubre: ['C', 'MC'], condiciones: 'C=V, D=F (straight no es apuesta simple)', esperadoValor: { totalWin: 0, pagos: [[false, 0, 0, false]] }, run: () => liquidar([b('straight', 5, 100)], 0) },
  { id: 'CB-RL-10', objetivo: 'Rojo gana: paga 2× (1 a 1 + apuesta)', entrada: 'rojo por 100, sale 1', camino: 'A(F)→won(V)→M(F)→N5', cubre: ['D', 'C', 'MC'], condiciones: 'A=F, won=V', esperadoValor: { totalWin: 200, pagos: [[true, 200, 0, false]] }, run: () => liquidar([b('color', 'red', 100)], 1) },
  { id: 'CB-RL-11', objetivo: 'El bono caliente NO aplica a apuestas que no son al pleno (A falsa aunque el número sea caliente)', entrada: 'negro por 100, sale 17 (negro), calientes=[17]', camino: 'A(F)→(B no se evalúa)→won(V)→M(F)', cubre: ['MC'], condiciones: 'A=F (cortocircuito)', esperadoValor: { totalWin: 200, pagos: [[true, 200, 0, false]] }, run: () => liquidar([b('color', 'black', 100)], 17, [{ number: 17, hits: 9 }]) },
  { id: 'CB-RL-12', objetivo: 'La Partage redondea hacia abajo con apuestas impares', entrada: 'par por 25, sale 0', camino: 'C(V)→D(V)→N7', cubre: ['D'], condiciones: 'floor(25/2)=12', esperadoValor: { totalWin: 12, pagos: [[false, 0, 12, false]] }, run: () => liquidar([b('parity', 'even', 25)], 0) },
  { id: 'CB-RL-13', objetivo: 'Varias apuestas en la misma tirada: el total suma los pagos', entrada: 'pleno 17 por 50, negro por 100, docena 2 por 100; sale 17 (negro, docena 2)', camino: 'map con 3 iteraciones', cubre: ['P'], condiciones: 'map: 3 iteraciones', esperadoValor: { totalWin: 2300, pagos: [[true, 1800, 0, false], [true, 200, 0, false], [true, 300, 0, false]] }, run: () => liquidar([b('straight', 17, 50), b('color', 'black', 100), b('dozen', 2, 100)], 17) },
  { id: 'CB-RL-14', objetivo: 'Límite bajo/alto: 18 es "low" y 19 es "high"', entrada: 'low por 100 con 18; high por 100 con 19', camino: 'matches(half)', cubre: ['D'], condiciones: 'number<=18 / number>=19', esperadoValor: { low18: true, high19: true, low19: false, high18: false }, run: () => ({ low18: liquidar([b('half', 'low', 100)], 18).pagos[0][0], high19: liquidar([b('half', 'high', 100)], 19).pagos[0][0], low19: liquidar([b('half', 'low', 100)], 19).pagos[0][0], high18: liquidar([b('half', 'high', 100)], 18).pagos[0][0] }) },
  { id: 'CB-RL-15', objetivo: 'Columna 3 con el 36 y paridad/color/docena con distintos números (ramas de matches)', entrada: 'columna 3→36; impar→7; negro→2; docena 3→36', camino: 'matches(column|parity|color|dozen)', cubre: ['D'], condiciones: 'cada case de matches', esperadoValor: { col3_36: true, impar7: true, negro2: true, doc3_36: true, par7: false }, run: () => ({ col3_36: liquidar([b('column', 3, 100)], 36).pagos[0][0], impar7: liquidar([b('parity', 'odd', 100)], 7).pagos[0][0], negro2: liquidar([b('color', 'black', 100)], 2).pagos[0][0], doc3_36: liquidar([b('dozen', 3, 100)], 36).pagos[0][0], par7: liquidar([b('parity', 'even', 100)], 7).pagos[0][0] }) },
  { id: 'CB-RL-16', objetivo: 'Tipo de apuesta desconocido: matches cae en default y no paga', entrada: 'tipo "xyz" por 100, sale 5', camino: 'matches(default)', cubre: ['D'], condiciones: 'default del switch', esperadoValor: { totalWin: 0, pagos: [[false, 0, 0, false]] }, run: () => liquidar([b('xyz', 5, 100)], 5) },
];

// ───────────────────────── Metadatos por función (cobertura mínima requerida y lograda) ─────────────────────────
const funciones = [
  { clave: 'RNG', nombre: 'weightedPick', archivo: 'src/utils/rng.js', modulo: 'Tragamonedas (sorteo ponderado de símbolos)', V: 3, casos: rng,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar N1…N6', minimo: 3, casos: ['CB-RNG-01', 'CB-RNG-02', 'CB-RNG-03'], nota: 'N4 (gana), N5 (resta) y N6 (failsafe) exigen 3 casos distintos' },
      { criterio: 'Decisión', requisito: 'for: Sí/No · if: True/False', minimo: 3, casos: ['CB-RNG-01', 'CB-RNG-02', 'CB-RNG-03'], nota: 'for=No solo ocurre agotando la lista (r=100)' },
      { criterio: 'Condición simple', requisito: 'Cada condición V y F (son las mismas de las decisiones)', minimo: 3, casos: ['CB-RNG-01', 'CB-RNG-02', 'CB-RNG-03'], nota: 'No hay condiciones compuestas' },
      { criterio: 'Condición múltiple', requisito: 'No aplica (no hay && ni ||)', minimo: 0, casos: [], nota: 'Equivale a decisión' },
      { criterio: 'Caminos', requisito: 'V(G)=3 caminos independientes + ciclo con 0 iteraciones', minimo: 3, casos: ['CB-RNG-01', 'CB-RNG-02', 'CB-RNG-03', 'CB-RNG-04'], nota: 'Se agrega CB-RNG-04 por la prueba de ciclo con 0 iteraciones' },
    ] },
  { clave: 'VIP', nombre: 'calculateVipLevel', archivo: 'src/utils/vip.js', modulo: 'Billetera / niveles VIP', V: 4, casos: vipCases,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar los 4 return', minimo: 4, casos: ['CB-VIP-01', 'CB-VIP-04', 'CB-VIP-07', 'CB-VIP-10'], nota: 'Uno por nivel' },
      { criterio: 'Decisión', requisito: '3 decisiones × (V, F)', minimo: 4, casos: ['CB-VIP-01', 'CB-VIP-04', 'CB-VIP-07', 'CB-VIP-10'], nota: 'Los 4 caminos cubren las 6 salidas' },
      { criterio: 'Condición simple', requisito: 'Igual que decisión (1 condición por if)', minimo: 4, casos: ['CB-VIP-01', 'CB-VIP-04', 'CB-VIP-07', 'CB-VIP-10'], nota: '' },
      { criterio: 'Condición múltiple', requisito: 'No aplica', minimo: 0, casos: [], nota: '' },
      { criterio: 'Caminos', requisito: 'V(G)=4 caminos independientes', minimo: 4, casos: ['CB-VIP-01', 'CB-VIP-04', 'CB-VIP-07', 'CB-VIP-10'], nota: 'Se agregan 6 casos de valor límite (50000/49999, 20000/19999, 5000/4999) para detectar > en vez de >=' },
    ] },
  { clave: 'HS', nombre: 'handScore (+ cardValue)', archivo: 'src/services/blackjackRules.js', modulo: 'Blackjack (valor de la mano)', V: 5, casos: handScore,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar N1…N9', minimo: 1, casos: ['CB-HS-04'], nota: 'Una mano con As que se pasa recorre todas las sentencias' },
      { criterio: 'Decisión', requisito: 'for, if, while: V y F', minimo: 2, casos: ['CB-HS-04', 'CB-HS-02'], nota: 'if=F lo da cualquier carta no As (la 6 o la 9 en CB-HS-04)' },
      { criterio: 'Condición simple', requisito: 'A (total>21) y B (aces>0) cada una V y F', minimo: 2, casos: ['CB-HS-04', 'CB-HS-05'], nota: 'B=F con A=V solo ocurre sin Ases y pasándose' },
      { criterio: 'Condición múltiple', requisito: 'A&&B: VV, VF, FV, FF', minimo: 4, casos: ['CB-HS-04', 'CB-HS-05', 'CB-HS-03', 'CB-HS-02'], nota: 'Con cortocircuito la evaluación real tiene 3 salidas (VV, VF, F-)' },
      { criterio: 'Caminos', requisito: 'V(G)=5 independientes + ciclo while 0/1/2/n', minimo: 5, casos: ['CB-HS-01', 'CB-HS-02', 'CB-HS-03', 'CB-HS-04', 'CB-HS-05'], nota: 'Más CB-HS-06/07/11 para ciclo con 1, 2 y 4 vueltas' },
    ] },
  { clave: 'SP', nombre: 'canSplit', archivo: 'src/services/blackjackRules.js', modulo: 'Blackjack (dividir manos)', V: 5, casos: canSplit,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar la expresión (1 sentencia)', minimo: 1, casos: ['CB-SP-06'], nota: '' },
      { criterio: 'Decisión', requisito: 'Resultado true y false', minimo: 2, casos: ['CB-SP-06', 'CB-SP-01'], nota: '' },
      { criterio: 'Condición simple', requisito: 'C1…C5 cada una V y F', minimo: 6, casos: ['CB-SP-06', 'CB-SP-01', 'CB-SP-02', 'CB-SP-03', 'CB-SP-04', 'CB-SP-05'], nota: 'Una verdadera para todas + una falsa por condición' },
      { criterio: 'Condición múltiple', requisito: 'Combinaciones alcanzables con cortocircuito (2⁵=32 teóricas)', minimo: 6, casos: ['CB-SP-06', 'CB-SP-01', 'CB-SP-02', 'CB-SP-03', 'CB-SP-04', 'CB-SP-05'], nota: 'Con && solo 6 combinaciones son distinguibles (equivale a MC/DC: n+1)' },
      { criterio: 'Caminos', requisito: 'V(G)=5 caminos independientes', minimo: 5, casos: ['CB-SP-06', 'CB-SP-01', 'CB-SP-02', 'CB-SP-03', 'CB-SP-04'], nota: 'CB-SP-05 (C5 falsa) recorre el mismo camino del grafo que CB-SP-06 pero con otro valor; CB-SP-07/08/09 son valores equivalentes y límites' },
    ] },
  { clave: 'BD', nombre: 'bankerDraws', archivo: 'src/services/baccaratRules.js', modulo: 'Bacará (tercera carta de la Banca)', V: 12, casos: bankerCases,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar cada return', minimo: 7, casos: ['CB-BD-01', 'CB-BD-03', 'CB-BD-06', 'CB-BD-09', 'CB-BD-13', 'CB-BD-15', 'CB-BD-18'], nota: 'Un return por case + default + el de "Punto se plantó"' },
      { criterio: 'Decisión', requisito: 'if y cada case V/F (total 0..7)', minimo: 12, casos: ['CB-BD-01', 'CB-BD-03', 'CB-BD-04', 'CB-BD-05', 'CB-BD-06', 'CB-BD-08', 'CB-BD-09', 'CB-BD-12', 'CB-BD-13', 'CB-BD-15', 'CB-BD-16', 'CB-BD-18'], nota: '' },
      { criterio: 'Condición simple', requisito: 'p>=2, p<=7, p>=4, p<=7, p===6, p===7 cada una V y F', minimo: 9, casos: ['CB-BD-08', 'CB-BD-09', 'CB-BD-10', 'CB-BD-12', 'CB-BD-13', 'CB-BD-14', 'CB-BD-15', 'CB-BD-16', 'CB-BD-17'], nota: '' },
      { criterio: 'Condición múltiple', requisito: 'Combinaciones de cada && / ||', minimo: 9, casos: ['CB-BD-08', 'CB-BD-09', 'CB-BD-10', 'CB-BD-12', 'CB-BD-13', 'CB-BD-14', 'CB-BD-15', 'CB-BD-16', 'CB-BD-17'], nota: 'p>=2&&p<=7 y p>=4&&p<=7: VV,VF,FV(no alcanzable con p entero real en FF); p===6||p===7: V-,FV,FF' },
      { criterio: 'Caminos', requisito: 'V(G)=12', minimo: 12, casos: ['CB-BD-01', 'CB-BD-03', 'CB-BD-04', 'CB-BD-05', 'CB-BD-06', 'CB-BD-08', 'CB-BD-09', 'CB-BD-12', 'CB-BD-13', 'CB-BD-15', 'CB-BD-16', 'CB-BD-18'], nota: 'Se ejecutan 18 casos' },
    ] },
  { clave: 'RL', nombre: 'settleBets (+ matches)', archivo: 'src/services/rouletteService.js', modulo: 'Ruleta (liquidación de apuestas)', V: 6, casos: roulette,
    minimos: [
      { criterio: 'Sentencia', requisito: 'Ejecutar todas las sentencias del callback', minimo: 3, casos: ['CB-RL-03', 'CB-RL-05', 'CB-RL-02'], nota: 'bono caliente, La Partage y pago normal' },
      { criterio: 'Decisión', requisito: 'won, ternario, else-if: V y F', minimo: 4, casos: ['CB-RL-02', 'CB-RL-03', 'CB-RL-05', 'CB-RL-06'], nota: '' },
      { criterio: 'Condición simple', requisito: 'A, B, C, D cada una V y F', minimo: 5, casos: ['CB-RL-02', 'CB-RL-03', 'CB-RL-04', 'CB-RL-05', 'CB-RL-07', 'CB-RL-06'], nota: 'B=F con lista no vacía en CB-RL-04' },
      { criterio: 'Condición múltiple', requisito: 'A&&B y C&&D', minimo: 6, casos: ['CB-RL-02', 'CB-RL-03', 'CB-RL-11', 'CB-RL-05', 'CB-RL-07', 'CB-RL-06'], nota: 'A&&B: VV, VF, F-; C&&D: VV, VF, F-' },
      { criterio: 'Caminos', requisito: 'V(G)=6 + ciclo map con 0/1/n', minimo: 6, casos: ['CB-RL-01', 'CB-RL-02', 'CB-RL-03', 'CB-RL-05', 'CB-RL-06', 'CB-RL-07'], nota: 'CB-RL-13 recorre el map con 3 iteraciones' },
    ] },
];

module.exports = { funciones, casos: funciones.flatMap((f) => f.casos.map((c) => ({ ...c, funcion: f.nombre, archivo: f.archivo, modulo: f.modulo, tecnica: 'Caja blanca' }))) };
