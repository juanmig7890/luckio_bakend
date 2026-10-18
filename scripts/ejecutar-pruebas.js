// Ejecuta TODOS los catálogos de caja blanca y caja negra y guarda la evidencia del ciclo:
//   evidencias/ciclo-N/resultados.json   (todos los casos con lo esperado y lo obtenido)
//   evidencias/ciclo-N/consola.txt       (lo mismo en texto, como una captura de terminal)
// Uso:  node scripts/ejecutar-pruebas.js 1
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ciclo = process.argv[2] || '1';
const raiz = path.resolve(__dirname, '..');
const salida = path.join(raiz, 'evidencias', `ciclo-${ciclo}`);
fs.mkdirSync(salida, { recursive: true });

const catalogos = [
  ['Caja blanca', 'tests/caja-blanca/catalogo.js'],
  ['Caja negra · Reglas', 'tests/caja-negra/unidad.js'],
  ['Caja negra · Cuentas y billetera', 'tests/caja-negra/api-auth.js'],
  ['Caja negra · Tragamonedas y VIP', 'tests/caja-negra/api-slots.js'],
  ['Caja negra · Ruleta', 'tests/caja-negra/api-ruleta.js'],
  ['Caja negra · Bacará', 'tests/caja-negra/api-bacara.js'],
  ['Caja negra · Blackjack', 'tests/caja-negra/api-blackjack.js'],
  ['Caja negra · Plinko', 'tests/caja-negra/api-plinko.js'],
  ['Caja negra · Límite de peticiones', 'tests/caja-negra/api-limite.js'],
];

const todos = [];
const lineas = [];
const log = (t = '') => { lineas.push(t); console.log(t); };
const barra = '='.repeat(118);

log(barra);
log(`  EVIDENCIA DE EJECUCIÓN · LUCK.IO · CICLO DE PRUEBA ${ciclo} · ${new Date().toISOString()}`);
log(barra);

for (const [nombre, ruta] of catalogos) {
  const r = spawnSync(process.execPath, [path.join(__dirname, '_correr-catalogo.js'), ruta], { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 });
  const marca = (r.stdout || '').split('\n').find((l) => l.startsWith('@@RESULTADOS@@'));
  if (!marca) { log(`\n[ERROR] No se pudo ejecutar ${ruta}\n${r.stderr || r.stdout}`); process.exitCode = 1; continue; }
  const res = JSON.parse(marca.slice('@@RESULTADOS@@'.length));
  const paso = res.filter((x) => x.estado === 'PASÓ').length;
  log(`\n── ${nombre}  (${paso}/${res.length} pasaron)`);
  for (const x of res) {
    const esp = x.esperado.length > 46 ? `${x.esperado.slice(0, 43)}...` : x.esperado;
    const obt = x.obtenido.length > 46 ? `${x.obtenido.slice(0, 43)}...` : x.obtenido;
    log(`${x.id.padEnd(11)}| Esperado: ${esp.padEnd(46)} | Obtenido: ${obt.padEnd(46)} | ESTADO: ${x.estado === 'PASÓ' ? 'PASÓ ✅' : 'FALLÓ ❌'}`);
    todos.push({ grupo: nombre, ...x });
  }
}

const total = todos.length;
const paso = todos.filter((x) => x.estado === 'PASÓ').length;
const porTipo = {};
todos.forEach((x) => { const t = x.grupo.startsWith('Caja blanca') ? 'Caja blanca' : 'Caja negra'; porTipo[t] = porTipo[t] || { total: 0, paso: 0 }; porTipo[t].total++; if (x.estado === 'PASÓ') porTipo[t].paso++; });
log(`\n${barra}`);
Object.entries(porTipo).forEach(([t, v]) => log(`  ${t.padEnd(12)} ${v.paso}/${v.total} casos exitosos (${((v.paso / v.total) * 100).toFixed(1)}%)`));
log(`  TOTAL        ${paso}/${total} casos exitosos (${((paso / total) * 100).toFixed(1)}%)   ·   FALLAN: ${total - paso}`);
log(barra);
const fallos = todos.filter((x) => x.estado !== 'PASÓ');
if (fallos.length) { log('\nCASOS QUE FALLARON:'); fallos.forEach((x) => log(` - ${x.id}: ${x.objetivo}\n     esperado: ${x.esperado}\n     obtenido: ${x.obtenido}`)); }

fs.writeFileSync(path.join(salida, 'resultados.json'), JSON.stringify({ ciclo, fecha: new Date().toISOString(), resumen: { total, paso, fallo: total - paso, porTipo }, casos: todos }, null, 2));
fs.writeFileSync(path.join(salida, 'consola.txt'), `${lineas.join('\n')}\n`);
