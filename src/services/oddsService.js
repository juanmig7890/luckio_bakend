const axios = require('axios');

const BASE = 'https://api.the-odds-api.com/v4';
// La cuenta gratuita de The Odds API da 500 peticiones al mes (el costo de cada llamada es mercados × regiones).
// "upcoming" por sí solo trae lo que esté por arrancar en CUALQUIER deporte, así que las ligas más conocidas a
// veces no salen (si su próximo partido no es en las próximas horas). Para asegurar que sí aparezcan, se pide
// además cada una por separado, pero solo con el mercado principal (h2h) para no disparar el costo.
const TTL = 60 * 60 * 1000; // 1 hora de caché: con más llamadas por refresco, hay que estirarlas más
const POPULAR_LEAGUES = [
  'soccer_uefa_champs_league',
  'soccer_spain_la_liga',
  'soccer_epl',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_france_ligue_one',
  'soccer_usa_mls',
  'soccer_mexico_ligamx',
];
let cache = { at: 0, events: [] };

const apiError = (e) => {
  const err = new Error(
    e.response?.status === 401 || e.response?.status === 429
      ? 'Límite o clave inválida en The Odds API'
      : 'No se pudo consultar The Odds API'
  );
  err.status = 502;
  return err;
};

const normalize = (ev) => {
  const book = ev.bookmakers?.[0];
  const h2h = book?.markets?.find((m) => m.key === 'h2h');
  if (!h2h) return null;
  const totals = book.markets.find((m) => m.key === 'totals');
  return {
    id: ev.id,
    sportKey: ev.sport_key,
    sportTitle: ev.sport_title,
    commenceTime: ev.commence_time,
    homeTeam: ev.home_team,
    awayTeam: ev.away_team,
    odds: h2h.outcomes.map((o) => ({ name: o.name, price: o.price })),
    // Total de goles (más/menos de X.5): no todas las casas lo ofrecen para cada partido, puede venir vacío
    totals: totals ? totals.outcomes.map((o) => ({ name: o.name, point: o.point, price: o.price })) : [],
  };
};

const fetchMarket = async (path, markets) => {
  const { data } = await axios.get(`${BASE}/sports/${path}/odds/`, {
    params: { regions: 'us', markets, oddsFormat: 'decimal', apiKey: process.env.ODDS_API_KEY },
    timeout: 10000,
  });
  return data;
};

const getEvents = async () => {
  if (Date.now() - cache.at < TTL && cache.events.length) return cache.events;
  try {
    const [upcoming, ...leagues] = await Promise.allSettled([
      fetchMarket('upcoming', 'h2h,totals'),
      ...POPULAR_LEAGUES.map((key) => fetchMarket(key, 'h2h')),
    ]);

    const byId = new Map();
    const addAll = (result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((ev) => {
        const norm = normalize(ev);
        if (norm && !byId.has(norm.id)) byId.set(norm.id, norm);
      });
    };
    addAll(upcoming);
    leagues.forEach(addAll);

    const events = [...byId.values()].filter((e) => new Date(e.commenceTime) > new Date());
    if (events.length === 0 && upcoming.status === 'rejected') throw upcoming.reason; // todo falló: sí es un error real
    cache = { at: Date.now(), events };
    return events;
  } catch (e) {
    if (cache.events.length) return cache.events; // si falla, usa lo último guardado
    throw apiError(e);
  }
};

const getScores = async (sportKey) => {
  try {
    const { data } = await axios.get(`${BASE}/sports/${sportKey}/scores/`, {
      params: { daysFrom: 3, apiKey: process.env.ODDS_API_KEY },
      timeout: 10000,
    });
    return data;
  } catch (e) {
    throw apiError(e);
  }
};

module.exports = { getEvents, getScores };
