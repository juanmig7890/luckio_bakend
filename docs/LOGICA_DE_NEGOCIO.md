# LUCK.IO — Lógica de negocio (más allá del CRUD)

El proyecto **no es solo CRUD** (crear/leer/actualizar/borrar usuarios o registros). Casi todo el valor está en reglas
de negocio con cifras exactas, escritas como **funciones puras** (sin base de datos) para poder probarlas de forma aislada.
Los controladores solo orquestan: validan, cobran, llaman a la regla y pagan.

| Qué es CRUD | Qué es lógica de negocio |
|---|---|
| Registrar / iniciar sesión, ver perfil, recargar fichas | Todo lo de abajo |

## 1. Funcionalidades con reglas y números exactos

| # | Funcionalidad | Regla y cifras exactas | Código | Pruebas |
|---|---|---|---|---|
| F1 | **Valor de una mano de Blackjack** | 2–10 = su número; J, Q, K = 10; As = 11 o 1 (cuenta 11 salvo que se pase de 21) | `services/blackjackRules.js → handScore` | `tests/blackjack.test.js` |
| F2 | **Decisión del crupier** | Pide con 16 o menos; se planta con 17 o más (también en 17 suave) | `dealerShouldHit`, `dealerPlay` | `blackjack.test.js` |
| F3 | **Pagos del Blackjack** | Victoria 1:1 (apuesta × 2 en total); blackjack natural 3:2 → `floor(apuesta × 2.5)`; blackjack histórico (A♠ + J♠/J♣) 10:1; empate devuelve la apuesta; rendirse devuelve `floor(apuesta / 2)` | `mainPayout`, `isHistoricBlackjack` | `blackjack.test.js`, `blackjack.flow.test.js` |
| F4 | **Dividir (split)** | Solo con 2 cartas del mismo valor (K con Q sí); cuesta otra apuesta igual; máximo 4 manos; Ases divididos reciben 1 carta y no se redividen; un 21 tras dividir NO es blackjack (paga 1:1); se puede doblar después de dividir | `canSplit` + `controllers/blackjackController.js → split` | `blackjack.test.js`, `blackjack.flow.test.js` |
| F5 | **Charlie de 5 cartas** | 5 o más cartas sin pasarse de 21 gana automáticamente 1:1 | `isCharlie` | ambos |
| F6 | **Seguro** | Se ofrece si la carta visible del crupier es As; cuesta `floor(apuesta / 2)`; paga 2:1 (total ×3) si el crupier tiene blackjack | `insuranceCost`, `INSURANCE_PAYOUT` | `blackjack.flow.test.js` |
| F7 | **Perfect Pairs** (apuesta lateral) | Pareja de tus 2 cartas: mixta 6:1, mismo color 12:1, mismo palo 25:1 (totales ×7, ×13, ×26) | `evaluatePairs`, `PAIRS_PAYOUT` | `blackjack.test.js` |
| F8 | **21+3** (apuesta lateral) | Tus 2 cartas + la visible del crupier como póker: color 5:1, escalera 10:1, trío 30:1, escalera de color 40:1, trío del mismo palo 100:1 | `evaluateTwentyOnePlusThree` | `blackjack.test.js` |
| F9 | **Bacará: tercera carta** | Punto pide con 0–5; Banca según tabla fija (total de la Banca vs. tercera carta del Punto); con 8 o 9 (natural) nadie pide | `services/baccaratRules.js → playerDraws, bankerDraws, dealRound` | `tests/baccarat.test.js` |
| F10 | **Bacará: pagos** | Punto 1:1; Banca 1:1 menos 5% de comisión (`floor`); Empate 8:1 (y devuelve Punto/Banca); Pareja Punto/Banca 11:1 | `settle` | `baccarat.test.js` |
| F11 | **Ruleta: pagos** | Pleno 35:1 (total ×36); color, par/impar, 1-18/19-36 1:1 (×2); docena y columna 2:1 (×3) | `services/rouletteService.js → settleBets` | `tests/roulette.test.js` |
| F12 | **Ruleta: La Partage y números calientes** | Si sale 0, las apuestas simples recuperan `floor(apuesta / 2)`; un pleno sobre un número "caliente" (top 5 de las últimas 100 tiradas, mínimo 30 de historial) paga +50% | `settleBets`, `getHotNumbers` | `roulette.test.js` |
| F13 | **Plinko** | 12 filas, 13 casillas, 3 niveles de riesgo; cada fila izquierda/derecha 50%; RTP ≈ 97% verificado de forma exacta con la binomial | `services/plinkoService.js` | `tests/plinko.test.js` |
| F14 | **Tragamonedas** | 5 líneas (3 filas + 2 diagonales); la apuesta se reparte en 5; multiplicadores 🍒×8, 🍋×12, 🔔×25, 💎×60, 7️⃣×200; 3+ 🎰 en cualquier lugar = jackpot | `services/slotsService.js` | — |
| F15 | **Nivel VIP** | Total apostado: ≥ 5 000 Plata, ≥ 20 000 Oro, ≥ 50 000 VIP LUCK.IO; menos, Bronce | `utils/vip.js` | — |
| F16 | **Validación y cobro de apuestas** | Apuesta entera entre 10 y 100 000 por casilla; máximo 20 apuestas distintas por tirada de ruleta; total por tirada ≤ 100 000; **un solo cobro atómico** por todo lo apostado (si no alcanza el saldo no se cobra nada) | `walletService.placeBet` + rutas/`normalizeBet` | flow tests |
| F17 | **Mesas en vivo (multijugador)** | Máquina de estados por ronda: apuestas abiertas 20 s → sorteo 7 s → resultado 4 s; un solo resultado para todos; cada jugador cobra según SUS apuestas; apuestas cerradas se rechazan; si el sorteo falla se devuelve lo apostado | `realtime/liveTable.js` (+ `rouletteTable.js`, `baccaratTable.js`) | `tests/liveTable.test.js`, `tests/live.socket.test.js` |

## 2. Cómo está organizado el código

```
src/
  services/    ← REGLAS PURAS (blackjackRules, baccaratRules, rouletteService, plinkoService, cards...)
  controllers/ ← orquestan: validan → cobran (wallet) → aplican la regla → pagan
  realtime/    ← mesas en vivo (Socket.IO): liveTable (motor), rouletteTable, baccaratTable, index (red)
  models/      ← Mongoose (solo datos)
  routes/      ← rutas + validación de entrada (express-validator)
tests/         ← node:test; las reglas se prueban sin base de datos; los flujos con dobles en memoria
```

Por qué las reglas están separadas: una función pura (entrada → salida) se prueba con un `assert` y sin levantar
Mongo, y es justo lo que se necesita para **caja blanca** (mirar las ramas del código) y **caja negra** (probar entradas y salidas sin mirar el código).

## 3. Cómo correr las pruebas

```
npm install
npm test          # corre todo tests/ con node --test
```

## 4. Material listo para las pruebas del taller

- **Caja negra** (por clases de equivalencia y valores límite): apuesta mínima/máxima (9, 10, 100 000, 100 001), saldo justo/insuficiente, cantidad de cartas (4 vs 5 para Charlie), manos al dividir (3 vs 4 vs 5), pagos con apuesta impar (redondeo `floor`), tablas de Bacará.
- **Caja blanca** (cobertura de sentencias/decisiones/caminos): `handScore` (bucle del As), `canSplit` (cada condición), `bankerDraws` (cada `case`), `settleBets` (ganó / La Partage / perdió), `LiveTable.placeNow` (fase, asiento, tope, saldo).
- Los números calientes y la mesa en vivo dependen del tiempo y de la base de datos: por eso reciben dependencias inyectables (`deps`, `durations`, `now`) y se prueban con dobles.
