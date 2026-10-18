// Prueba de mutación manual: se rompe el código a propósito (un "mutante" a la vez) y se verifica que los casos de
// prueba DETECTEN el cambio (el mutante "muere"). Si ningún caso falla, el mutante "sobrevive" y hay un hueco en las pruebas.
// Uso: node scripts/mutacion.js      → evidencias/mutacion/mutacion.json y consola.txt
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const salida = path.join(raiz, 'evidencias', 'mutacion');
fs.mkdirSync(salida, { recursive: true });

const M = (id, funcion, archivo, buscar, poner, descripcion) => ({ id, funcion, archivo, buscar, poner, descripcion });
const mutantes = [
  M('M01', 'weightedPick', 'src/utils/rng.js', 'if (r < item.w)', 'if (r <= item.w)', 'Cambiar < por <= en la comparación del peso'),
  M('M02', 'weightedPick', 'src/utils/rng.js', 'r -= item.w;', 'r += item.w;', 'Sumar en vez de restar el peso'),
  M('M03', 'weightedPick', 'src/utils/rng.js', 'return items[items.length - 1];', 'return items[0];', 'Retorno de seguridad devuelve el primer ítem'),
  M('M04', 'calculateVipLevel', 'src/utils/vip.js', 'totalWagered >= 50000', 'totalWagered > 50000', 'Límite de VIP: >= pasa a >'),
  M('M05', 'calculateVipLevel', 'src/utils/vip.js', 'totalWagered >= 20000', 'totalWagered > 20000', 'Límite de Oro: >= pasa a >'),
  M('M06', 'calculateVipLevel', 'src/utils/vip.js', 'totalWagered >= 5000', 'totalWagered > 5000', 'Límite de Plata: >= pasa a >'),
  M('M07', 'calculateVipLevel', 'src/utils/vip.js', "return 'Oro';", "return 'Plata';", 'Nivel Oro devuelve Plata'),
  M('M08', 'handScore', 'src/services/blackjackRules.js', 'while (total > 21 && aces > 0)', 'while (total >= 21 && aces > 0)', 'Ajustar el As también cuando la mano vale exactamente 21'),
  M('M09', 'handScore', 'src/services/blackjackRules.js', 'while (total > 21 && aces > 0)', 'while (total > 21 && aces > 1)', 'El último As ya no baja a 1'),
  M('M10', 'handScore', 'src/services/blackjackRules.js', 'total -= 10;', 'total -= 9;', 'Al bajar un As se resta 9 en vez de 10'),
  M('M11', 'handScore', 'src/services/blackjackRules.js', "if (c.value === 'ACE') aces++;", "if (c.value === 'ACE') aces += 0;", 'No se cuentan los Ases'),
  M('M12', 'cardValue', 'src/services/blackjackRules.js', "if (v === 'ACE') return 11;", "if (v === 'ACE') return 10;", 'El As vale 10 en vez de 11'),
  M('M13', 'canSplit', 'src/services/blackjackRules.js', 'hand.cards.length === 2 &&', 'hand.cards.length >= 2 &&', 'Permite dividir con 2 o más cartas'),
  M('M14', 'canSplit', 'src/services/blackjackRules.js', 'handCount < MAX_HANDS &&', 'handCount <= MAX_HANDS &&', 'Permite una 5.ª mano (< pasa a <=)'),
  M('M15', 'canSplit', 'src/services/blackjackRules.js', '!hand.splitAce;', 'hand.splitAce !== true;', 'Cambio equivalente (mutante equivalente: debe sobrevivir)'),
  M('M16', 'canSplit', 'src/services/blackjackRules.js', 'cardValue(hand.cards[0].value) === cardValue(hand.cards[1].value) &&', 'hand.cards[0].value === hand.cards[1].value &&', 'Exige misma figura (K y Q ya no se pueden dividir)'),
  M('M17', 'bankerDraws', 'src/services/baccaratRules.js', 'return bankerTotal <= 5;', 'return bankerTotal < 5;', 'Banca 5 ya no pide cuando el Punto se plantó'),
  M('M18', 'bankerDraws', 'src/services/baccaratRules.js', 'case 3: return p !== 8;', 'case 3: return p !== 7;', 'Banca 3: excepción con 7 en vez de 8'),
  M('M19', 'bankerDraws', 'src/services/baccaratRules.js', 'return p >= 2 && p <= 7;', 'return p >= 2 || p <= 7;', 'Banca 4: && cambia a ||'),
  M('M20', 'bankerDraws', 'src/services/baccaratRules.js', 'return p >= 4 && p <= 7;', 'return p > 4 && p <= 7;', 'Banca 5: límite inferior 4 pasa a 5'),
  M('M21', 'bankerDraws', 'src/services/baccaratRules.js', 'return p === 6 || p === 7;', 'return p === 6 && p === 7;', 'Banca 6: || cambia a &&'),
  M('M22', 'settleBets', 'src/services/rouletteService.js', "bet.betType === 'straight' && hotNumbers.some", "bet.betType === 'straight' || hotNumbers.some", 'Número caliente: && cambia a ||'),
  M('M23', 'settleBets', 'src/services/rouletteService.js', 'number === 0 && EVEN_MONEY.has(bet.betType)', 'number === 0 || EVEN_MONEY.has(bet.betType)', 'La Partage: && cambia a ||'),
  M('M24', 'settleBets', 'src/services/rouletteService.js', 'PAYOUTS[bet.betType] * HOT_BONUS', 'PAYOUTS[bet.betType] * 2', 'Bono caliente ×2 en vez de ×1.5'),
  M('M25', 'settleBets', 'src/services/rouletteService.js', 'Math.floor(bet.amount / 2)', 'Math.floor(bet.amount / 3)', 'La Partage devuelve un tercio'),
  M('M26', 'matches', 'src/services/rouletteService.js', 'number <= 18', 'number < 18', 'Falta: el 18 deja de pertenecer a "low"'),
  M('M27', 'matches', 'src/services/rouletteService.js', 'Math.ceil(n / 12)', 'Math.floor(n / 12)', 'Docenas calculadas con floor'),
  M('M28', 'matches', 'src/services/rouletteService.js', 'straight: 36', 'straight: 35', 'Pleno paga 35× total (el error real que se corrigió antes)'),
];

const copiar = (de, a) => fs.cpSync(de, a, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes('evidencias') });
const correr = (dir, archivos) => spawnSync(process.execPath, ['--test', ...archivos], { cwd: dir, encoding: 'utf8', timeout: 180000 });
const BLANCA = ['tests/caja-blanca/caja-blanca.test.js'];
const NEGRA = ['tests/caja-negra/unidad.test.js', 'tests/caja-negra/api-auth.test.js', 'tests/caja-negra/api-slots.test.js', 'tests/caja-negra/api-ruleta.test.js', 'tests/caja-negra/api-bacara.test.js', 'tests/caja-negra/api-blackjack.test.js', 'tests/caja-negra/api-plinko.test.js'];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
const resultados = [];
const lineas = [];
const log = (t) => { lineas.push(t); console.log(t); };
log('='.repeat(112)); log('  PRUEBA DE MUTACIÓN · ¿Las pruebas detectan errores introducidos a propósito?'); log('='.repeat(112));

for (const m of mutantes) {
  const dir = path.join(tmp, m.id);
  copiar(path.join(raiz, 'src'), path.join(dir, 'src'));
  copiar(path.join(raiz, 'tests'), path.join(dir, 'tests'));
  fs.symlinkSync(path.join(raiz, 'node_modules'), path.join(dir, 'node_modules'));
  const archivo = path.join(dir, m.archivo);
  const original = fs.readFileSync(archivo, 'utf8');
  if (!original.includes(m.buscar)) { log(`${m.id} NO SE PUDO APLICAR (texto no encontrado)`); continue; }
  fs.writeFileSync(archivo, original.replace(m.buscar, m.poner));
  const rb = correr(dir, BLANCA);
  let detectadoPor = rb.status !== 0 ? 'caja blanca' : null;
  if (!detectadoPor) { const rn = correr(dir, NEGRA); if (rn.status !== 0) detectadoPor = 'caja negra'; }
  const estado = detectadoPor ? 'MUERTO' : 'SOBREVIVIÓ';
  resultados.push({ ...m, estado, detectadoPor: detectadoPor || '—' });
  log(`${m.id} ${m.funcion.padEnd(18)} ${estado.padEnd(11)} (${(detectadoPor || 'nadie lo detectó').padEnd(16)}) ${m.descripcion}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });

const muertos = resultados.filter((r) => r.estado === 'MUERTO').length;
const porBlanca = resultados.filter((r) => r.detectadoPor === 'caja blanca').length;
log('='.repeat(112));
log(`  Mutantes aplicados: ${resultados.length} · detectados: ${muertos} (${((muertos / resultados.length) * 100).toFixed(1)}%) · por caja blanca: ${porBlanca} · solo por caja negra: ${muertos - porBlanca} · sobrevivieron: ${resultados.length - muertos}`);
log('='.repeat(112));
fs.writeFileSync(path.join(salida, 'mutacion.json'), JSON.stringify({ fecha: new Date().toISOString(), resumen: { aplicados: resultados.length, muertos, porBlanca, sobrevivieron: resultados.length - muertos }, mutantes: resultados }, null, 2));
fs.writeFileSync(path.join(salida, 'consola.txt'), `${lineas.join('\n')}\n`);
