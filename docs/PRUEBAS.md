# Pruebas de LUCK.IO (Entrega 1)

Resumen de las pruebas de caja blanca y caja negra. El detalle completo está en el documento de entrega y en
`docs/entrega-1/LuckIO_Entrega1_Casos_y_Evidencias.xlsx`.

| Qué | Número |
|---|---|
| Casos de caja blanca (6 funciones) | 72 |
| Casos de caja negra (API real + reglas) | 232 |
| Ciclo 1 (código original) | 296 / 304 (5 defectos) |
| Ciclo 2 (código corregido) | 304 / 304 |
| Cobertura de las 6 funciones | 100 % sentencias y ramas |
| Mutación | 27 de 28 mutantes detectados (1 equivalente) |

## Comandos (Node.js 20 o superior)

```
npm install
npm test                  # todas las pruebas
npm run test:caja-blanca  # 72 casos
npm run test:caja-negra   # 232 casos
npm run pruebas           # ejecuta el catálogo y escribe evidencias/ciclo-2
npm run cobertura         # cobertura por función
npm run mutacion          # prueba de mutación
npm run grafos            # redibuja los grafos (requiere Graphviz)
```

## Dónde está cada cosa

- `tests/caja-blanca/` catálogo (`catalogo.js`), grafos (`grafos.js`) y ejecutor.
- `tests/caja-negra/` catálogos por módulo y `entorno.js` (servidor real + base de datos simulada).
- `tests/soporte/run.js` registra el catálogo en `node:test` y genera la evidencia.
- `evidencias/` resultados de los dos ciclos, cobertura, mutación y grafos PNG.

## Defectos encontrados y corregidos

DEF-01 selección vacía en ruleta tomada como 0 · DEF-02 contraseña no texto da 500 · DEF-03 el seguro acepta 1 y "1" ·
DEF-04 id de partida mal formado da 500 · DEF-05 peticiones simultáneas de blackjack cobran doble (se serializan por jugador
con `src/utils/mutex.js`; solo protege una instancia del servidor).
