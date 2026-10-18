// Dibuja los grafos de flujo de control (CFG) de tests/caja-blanca/grafos.js como PNG con Graphviz.
// Uso: node scripts/dibujar-grafos.js   → evidencias/grafos/<funcion>.png (requiere `dot` instalado)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const grafos = require('../tests/caja-blanca/grafos');
const salida = path.join(__dirname, '..', 'evidencias', 'grafos');
fs.mkdirSync(salida, { recursive: true });
const esc = (s) => String(s).replace(/"/g, '\\"').replace(/\n/g, '\\n');
for (const [nombre, g] of Object.entries(grafos)) {
  let d = `digraph "${nombre}" {\n rankdir=TB; dpi=150; node [fontname="Helvetica", fontsize=11, style=filled];\n edge [fontname="Helvetica", fontsize=10];\n`;
  for (const n of g.nodos) {
    const forma = n.tipo === 't' ? 'ellipse, fillcolor="#d9d9d9"' : n.tipo === 'd' ? 'diamond, fillcolor="#fff2cc"' : 'box, fillcolor="#dae8fc"';
    d += ` ${n.id} [label="${esc(n.texto)}", shape=${forma}];\n`;
  }
  for (const e of g.aristas) d += ` ${e.de} -> ${e.a}${e.etiqueta ? ` [label="${esc(e.etiqueta)}"]` : ''};\n`;
  d += '}\n';
  const r = spawnSync('dot', ['-Tpng', '-o', path.join(salida, `${nombre}.png`)], { input: d });
  const V = g.aristas.length - g.nodos.length + 2;
  console.log(`${nombre}: N=${g.nodos.length} E=${g.aristas.length} V(G)=${V} ${r.status === 0 ? 'OK' : 'ERROR ' + r.stderr}`);
}
