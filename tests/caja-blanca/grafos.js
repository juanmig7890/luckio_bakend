// Grafos de flujo de control (CFG) de cada función probada. Se usan para dibujar los diagramas y para
// calcular la complejidad ciclomática V(G) = Aristas − Nodos + 2, que se contrasta con ESLint (regla "complexity").
// tipo: t = inicio/fin · p = proceso · d = decisión
const N = (id, texto, tipo = 'p') => ({ id, texto, tipo });
const E = (de, a, etiqueta = '') => ({ de, a, etiqueta });
const I = N('I', 'Inicio', 't');
const F = N('F', 'Fin', 't');

module.exports = {
  weightedPick: {
    nodos: [I, N('N1', 'Nodo 1: calcular\ntotal y r'), N('N2', 'Nodo 2: for…\n¿hay items?', 'd'), N('N3', 'Nodo 3: if\nr < item.w', 'd'), N('N4', 'Nodo 4:\nreturn item'), N('N5', 'Nodo 5:\nr -= item.w'), N('N6', 'Nodo 6: return\núltimo item'), F],
    aristas: [E('I', 'N1'), E('N1', 'N2'), E('N2', 'N3', 'Sí'), E('N2', 'N6', 'No'), E('N3', 'N4', 'True'), E('N3', 'N5', 'False'), E('N5', 'N2'), E('N4', 'F'), E('N6', 'F')],
  },
  calculateVipLevel: {
    nodos: [I, N('N1', 'Nodo 1: if\ntotal >= 50000', 'd'), N('N2', "Nodo 2:\nreturn 'VIP LUCK.IO'"), N('N3', 'Nodo 3: if\ntotal >= 20000', 'd'), N('N4', "Nodo 4:\nreturn 'Oro'"), N('N5', 'Nodo 5: if\ntotal >= 5000', 'd'), N('N6', "Nodo 6:\nreturn 'Plata'"), N('N7', "Nodo 7:\nreturn 'Bronce'"), F],
    aristas: [E('I', 'N1'), E('N1', 'N2', 'V'), E('N1', 'N3', 'F'), E('N3', 'N4', 'V'), E('N3', 'N5', 'F'), E('N5', 'N6', 'V'), E('N5', 'N7', 'F'), E('N2', 'F'), E('N4', 'F'), E('N6', 'F'), E('N7', 'F')],
  },
  handScore: {
    nodos: [I, N('N1', 'Nodo 1:\ntotal=0; aces=0'), N('N2', 'Nodo 2: for…\n¿hay más cartas?', 'd'), N('N3', 'Nodo 3: total +=\ncardValue(c.value)'), N('N4', "Nodo 4: if\nc.value === 'ACE'", 'd'), N('N5', 'Nodo 5:\naces++'), N('N6', 'Nodo 6: while\nA: total > 21', 'd'), N('N7', 'Nodo 7: while\nB: aces > 0', 'd'), N('N8', 'Nodo 8:\ntotal -= 10; aces--'), N('N9', 'Nodo 9:\nreturn total'), F],
    aristas: [E('I', 'N1'), E('N1', 'N2'), E('N2', 'N3', 'Sí'), E('N3', 'N4'), E('N4', 'N5', 'V'), E('N4', 'N2', 'F'), E('N5', 'N2'), E('N2', 'N6', 'No'), E('N6', 'N7', 'V'), E('N6', 'N9', 'F'), E('N7', 'N8', 'V'), E('N7', 'N9', 'F'), E('N8', 'N6'), E('N9', 'F')],
  },
  canSplit: {
    nodos: [I, N('N1', 'C1: Boolean(hand)', 'd'), N('N2', 'C2: cards.length === 2', 'd'), N('N3', 'C3: mismo valor\nde las 2 cartas', 'd'), N('N4', 'C4: handCount < 4', 'd'), N('N5', 'N5: return\n!hand.splitAce\n(C5, última condición)'), N('N6', 'N6: return false'), F],
    aristas: [E('I', 'N1'), E('N1', 'N2', 'V'), E('N1', 'N6', 'F'), E('N2', 'N3', 'V'), E('N2', 'N6', 'F'), E('N3', 'N4', 'V'), E('N3', 'N6', 'F'), E('N4', 'N5', 'V'), E('N4', 'N6', 'F'), E('N5', 'F'), E('N6', 'F')],
  },
  bankerDraws: {
    nodos: [I, N('N1', 'N1: if\n!playerThird', 'd'), N('N2', 'N2: return\nbankerTotal <= 5'), N('N3', 'N3: p =\npoints(playerThird)'), N('N4', 'N4: case 0', 'd'), N('N5', 'N5: case 1', 'd'), N('N6', 'N6: case 2', 'd'), N('N7', 'N7: case 3', 'd'), N('N8', 'N8: case 4', 'd'), N('N9', 'N9: case 5', 'd'), N('N10', 'N10: case 6', 'd'), N('N11', 'N11:\nreturn true'), N('N12', 'N12:\nreturn p !== 8'), N('N13', 'N13: p >= 2', 'd'), N('N14', 'N14:\nreturn p <= 7'), N('N15', 'N15: p >= 4', 'd'), N('N16', 'N16:\nreturn p <= 7'), N('N17', 'N17: p === 6', 'd'), N('N18', 'N18:\nreturn p === 7'), N('N19', 'N19:\nreturn false'), N('N20', 'N20:\nreturn true'), F],
    aristas: [E('I', 'N1'), E('N1', 'N2', 'V'), E('N1', 'N3', 'F'), E('N2', 'F'), E('N3', 'N4'), E('N4', 'N11', 'V'), E('N4', 'N5', 'F'), E('N5', 'N11', 'V'), E('N5', 'N6', 'F'), E('N6', 'N11', 'V'), E('N6', 'N7', 'F'), E('N7', 'N12', 'V'), E('N7', 'N8', 'F'), E('N12', 'F'), E('N8', 'N13', 'V'), E('N8', 'N9', 'F'), E('N13', 'N14', 'V'), E('N13', 'N19', 'F'), E('N14', 'F'), E('N9', 'N15', 'V'), E('N9', 'N10', 'F'), E('N15', 'N16', 'V'), E('N15', 'N19', 'F'), E('N16', 'F'), E('N10', 'N17', 'V'), E('N10', 'N19', 'F'), E('N17', 'N20', 'V'), E('N17', 'N18', 'F'), E('N18', 'F'), E('N20', 'F'), E('N11', 'F'), E('N19', 'F')],
  },
  settleBets: {
    nodos: [I, N('A', 'A: bet.betType\n=== "straight"', 'd'), N('HB', 'isHot = hotNumbers\n.some(h => h.number === número)\n(condición B)'), N('HF', 'isHot = false'), N('N2', 'won = matches(...)'), N('W', 'if (won)', 'd'), N('M', 'multiplier:\n¿isHot? (ternario)', 'd'), N('M1', 'multiplicador × 1.5\n(número caliente)'), N('M0', 'multiplicador normal'), N('N5', 'winAmount =\nfloor(amount × mult.)'), N('C', 'C: número === 0', 'd'), N('D', 'D: EVEN_MONEY.has(\nbetType)', 'd'), N('N7', 'laPartage =\nfloor(amount / 2)'), N('Ret', 'return {…resultado}'), F],
    aristas: [E('I', 'A'), E('A', 'HB', 'V'), E('A', 'HF', 'F'), E('HB', 'N2'), E('HF', 'N2'), E('N2', 'W'), E('W', 'M', 'V'), E('W', 'C', 'F'), E('M', 'M1', 'V'), E('M', 'M0', 'F'), E('M1', 'N5'), E('M0', 'N5'), E('N5', 'Ret'), E('C', 'D', 'V'), E('C', 'Ret', 'F'), E('D', 'N7', 'V'), E('D', 'Ret', 'F'), E('N7', 'Ret'), E('Ret', 'F')],
  },
};
