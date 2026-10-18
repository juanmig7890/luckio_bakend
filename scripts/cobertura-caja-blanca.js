// Mide la cobertura REAL (líneas y ramas) que logran los casos de caja blanca sobre cada función probada.
// Usa el medidor de cobertura de Node.js (V8). Resultado: evidencias/cobertura/cobertura.json y consola.txt
// Uso: node scripts/cobertura-caja-blanca.js
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const salida = path.join(raiz, 'evidencias', 'cobertura');
fs.mkdirSync(salida, { recursive: true });
const lcovPath = path.join(salida, 'cobertura.lcov');

const archivos = ['src/utils/rng.js', 'src/utils/vip.js', 'src/services/blackjackRules.js', 'src/services/baccaratRules.js', 'src/services/rouletteService.js'];
const args = ['--test', '--experimental-test-coverage', ...archivos.map((a) => `--test-coverage-include=${a}`)];

// 1) Informe de texto (como lo imprime Node)
const texto = spawnSync(process.execPath, [...args, 'tests/caja-blanca/caja-blanca.test.js'], { cwd: raiz, encoding: 'utf8' });
const todo = (texto.stdout + texto.stderr).split('\n').map((l) => l.replace(/^ℹ /, '').replace(/^# /, ''));
const iniInforme = todo.findIndex((l) => l.startsWith('start of coverage report'));
const resumen = todo.filter((l) => /^(tests|pass|fail) /.test(l)).join('   ');
const tabla = `${resumen}\n${todo.slice(iniInforme, todo.findIndex((l) => l.startsWith('end of coverage report')) + 1).join('\n')}`;
// 2) Informe lcov (línea por línea y rama por rama)
spawnSync(process.execPath, [...args, '--test-reporter=lcov', `--test-reporter-destination=${lcovPath}`, 'tests/caja-blanca/caja-blanca.test.js'], { cwd: raiz, encoding: 'utf8' });

const lcov = fs.readFileSync(lcovPath, 'utf8');
const porArchivo = {};
let actual = null;
for (const l of lcov.split('\n')) {
  if (l.startsWith('SF:')) { actual = l.slice(3); porArchivo[actual] = { DA: {}, BRDA: [] }; }
  else if (l.startsWith('DA:')) { const [n, c] = l.slice(3).split(','); porArchivo[actual].DA[Number(n)] = Number(c); }
  else if (l.startsWith('BRDA:')) { const [n, , , c] = l.slice(5).split(','); porArchivo[actual].BRDA.push([Number(n), c === '-' ? 0 : Number(c)]); }
}

// Rango de líneas de cada función (inicio = primera línea que cumple el patrón, fin = primera línea posterior que cumple el patrón de cierre)
const rango = (archivo, ini, fin) => {
  const lineas = fs.readFileSync(path.join(raiz, archivo), 'utf8').split('\n');
  const a = lineas.findIndex((l) => ini.test(l));
  const b = lineas.findIndex((l, i) => i >= a && fin.test(l));
  return [a + 1, b + 1];
};
const funciones = [
  { nombre: 'weightedPick', archivo: 'src/utils/rng.js', rangos: [rango('src/utils/rng.js', /^const weightedPick/, /^};/)] },
  { nombre: 'calculateVipLevel', archivo: 'src/utils/vip.js', rangos: [rango('src/utils/vip.js', /^const calculateVipLevel/, /^};/)] },
  { nombre: 'handScore (+ cardValue)', archivo: 'src/services/blackjackRules.js', rangos: [rango('src/services/blackjackRules.js', /^const cardValue/, /^};/), rango('src/services/blackjackRules.js', /^const handScore/, /^};/)] },
  { nombre: 'canSplit', archivo: 'src/services/blackjackRules.js', rangos: [rango('src/services/blackjackRules.js', /^const canSplit/, /!hand\.splitAce;/)] },
  { nombre: 'bankerDraws (+ points)', archivo: 'src/services/baccaratRules.js', rangos: [rango('src/services/baccaratRules.js', /^const points/, /^};/), rango('src/services/baccaratRules.js', /^const bankerDraws/, /^};/)] },
  { nombre: 'settleBets (+ matches)', archivo: 'src/services/rouletteService.js', rangos: [rango('src/services/rouletteService.js', /^const matches/, /^};/), rango('src/services/rouletteService.js', /^const settleBets/, /^};/)] },
];

const dentro = (n, rangos) => rangos.some(([a, b]) => n >= a && n <= b);
const filas = funciones.map((f) => {
  const d = porArchivo[f.archivo];
  const lineas = Object.entries(d.DA).filter(([n]) => dentro(Number(n), f.rangos));
  const ramas = d.BRDA.filter(([n]) => dentro(n, f.rangos));
  const lt = lineas.length; const lh = lineas.filter(([, c]) => c > 0).length;
  const bt = ramas.length; const bh = ramas.filter(([, c]) => c > 0).length;
  return { funcion: f.nombre, archivo: f.archivo, lineas: `${f.rangos.map(([a, b]) => `${a}-${b}`).join(', ')}`, sentenciasTotales: lt, sentenciasCubiertas: lh, sentencias: lt ? +((lh / lt) * 100).toFixed(1) : 100, ramasTotales: bt, ramasCubiertas: bh, ramas: bt ? +((bh / bt) * 100).toFixed(1) : 100 };
});

const out = [];
out.push('='.repeat(110), '  COBERTURA REAL DE LOS CASOS DE CAJA BLANCA (medidor de cobertura de Node.js / V8)', '='.repeat(110), '');
out.push('FUNCIÓN'.padEnd(28) + 'ARCHIVO'.padEnd(34) + 'SENTENCIAS'.padEnd(18) + 'DECISIONES/RAMAS');
filas.forEach((f) => out.push(f.funcion.padEnd(28) + f.archivo.padEnd(34) + `${f.sentenciasCubiertas}/${f.sentenciasTotales} (${f.sentencias}%)`.padEnd(18) + `${f.ramasCubiertas}/${f.ramasTotales} (${f.ramas}%)`));
out.push('', '--- Informe completo del medidor de Node.js ---', tabla);
fs.writeFileSync(path.join(salida, 'consola.txt'), `${out.join('\n')}\n`);
fs.writeFileSync(path.join(salida, 'cobertura.json'), JSON.stringify({ fecha: new Date().toISOString(), funciones: filas }, null, 2));
console.log(out.join('\n'));
