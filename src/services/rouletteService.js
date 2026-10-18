const { randomInt } = require('../utils/rng');
const RouletteSpin = require('../models/RouletteSpin');

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const colorOf = (n) => (n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black');

const dozenOf = (n) => (n === 0 ? 0 : Math.ceil(n / 12));
const columnOf = (n) => (n === 0 ? 0 : ((n - 1) % 3) + 1);

// Multiplicador de pago total (incluye la apuesta original devuelta): pleno 35 a 1 => 36x, 1 a 1 => 2x, 2 a 1 => 3x
const PAYOUTS = { straight: 36, color: 2, parity: 2, half: 2, dozen: 3, column: 3 };
const EVEN_MONEY = new Set(['color', 'parity', 'half']);

const matches = (betType, selection, number) => {
  switch (betType) {
    case 'straight':
      return Number(selection) === number;
    case 'color':
      return number !== 0 && colorOf(number) === selection;
    case 'parity':
      return number !== 0 && (selection === 'even' ? number % 2 === 0 : number % 2 === 1);
    case 'half':
      return number !== 0 && (selection === 'low' ? number <= 18 : number >= 19);
    case 'dozen':
      return number !== 0 && dozenOf(number) === Number(selection);
    case 'column':
      return number !== 0 && columnOf(number) === Number(selection);
    default:
      return false;
  }
};

// Números calientes: los que más salieron en el historial real reciente de la mesa (no son fijos)
const HOT_WINDOW = 100;
const HOT_TOP = 5;
const HOT_MIN_SAMPLES = 30;
const HOT_BONUS = 1.5; // 50% extra sobre el pago normal si el número caliente sale en una apuesta directa

const getHotNumbers = async () => {
  const recent = await RouletteSpin.find().sort({ createdAt: -1 }).limit(HOT_WINDOW).select('number').lean();
  if (recent.length < HOT_MIN_SAMPLES) return [];

  const counts = new Map();
  recent.forEach(({ number }) => counts.set(number, (counts.get(number) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, HOT_TOP)
    .map(([number, hits]) => ({ number, hits }));
};

// Evalúa TODAS las apuestas contra un número ya sorteado (función pura: no toca la base de datos).
// La usan la mesa individual y la mesa en vivo, así las dos pagan exactamente igual.
const settleBets = (bets, number, hotNumbers = []) => {
  const results = bets.map((bet) => {
    const isHot = bet.betType === 'straight' && hotNumbers.some((h) => h.number === number);
    const won = matches(bet.betType, bet.selection, number);

    let winAmount = 0;
    let laPartage = 0;
    if (won) {
      const multiplier = isHot ? PAYOUTS[bet.betType] * HOT_BONUS : PAYOUTS[bet.betType];
      winAmount = Math.floor(bet.amount * multiplier);
    } else if (number === 0 && EVEN_MONEY.has(bet.betType)) {
      // Regla "La Partage": el 0 en apuestas simples devuelve la mitad en vez de perderla toda
      laPartage = Math.floor(bet.amount / 2);
    }

    return { betType: bet.betType, selection: bet.selection, amount: bet.amount, won, winAmount, laPartage, isHot };
  });

  const totalWin = results.reduce((sum, r) => sum + r.winAmount + r.laPartage, 0);
  return { results, totalWin };
};

const spinNumber = () => randomInt(37); // 0-36

// Valida una apuesta suelta (tipo, selección y monto); devuelve la apuesta normalizada o lanza un error 400
const MIN_BET = 10;
const MAX_BET = 100000;
const BET_TYPES = Object.keys(PAYOUTS);

// Convierte una selección numérica ("17" o 17) a entero. Todo lo demás (null, "", [], false, "abc") es NaN:
// antes se usaba Number(), que convertía null/""/[]/false en 0 y dejaba apostar "sin querer" al número 0.
const parseIntSelection = (raw) => {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) return Number(raw);
  return NaN;
};

const normalizeBet = (raw) => {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!raw || !BET_TYPES.includes(raw.betType)) throw bad('Tipo de apuesta inválido');
  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) throw bad('Cada apuesta debe ser un entero entre 10 y 100,000');
  let selection = raw.selection;
  if (['straight', 'dozen', 'column'].includes(raw.betType)) selection = parseIntSelection(selection);
  const valid = {
    straight: Number.isInteger(selection) && selection >= 0 && selection <= 36,
    color: ['red', 'black'].includes(selection),
    parity: ['odd', 'even'].includes(selection),
    half: ['low', 'high'].includes(selection),
    dozen: [1, 2, 3].includes(selection),
    column: [1, 2, 3].includes(selection),
  }[raw.betType];
  if (!valid) throw bad('Una de las apuestas tiene una selección inválida para su tipo');
  return { betType: raw.betType, selection, amount };
};

// Tira la ruleta una vez y evalúa TODAS las apuestas de esa tirada contra el mismo número
// (como en la mesa real: podés poner fichas en varios números/colores a la vez)
const play = async (bets) => {
  const number = spinNumber();
  const color = colorOf(number);
  await RouletteSpin.create({ number, color });

  const hotNumbers = await getHotNumbers();
  const { results, totalWin } = settleBets(bets, number, hotNumbers);

  return { number, color, results, totalWin, hotNumbers };
};

module.exports = { play, settleBets, spinNumber, normalizeBet, parseIntSelection, getHotNumbers, colorOf, PAYOUTS, MIN_BET, MAX_BET };
