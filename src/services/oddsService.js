const axios = require('axios');

const BASE = 'https://api.the-odds-api.com/v4';
// La cuenta gratuita de The Odds API da 500 peticiones al mes. Pedir pocos mercados y de una sola región
// (el costo es mercados × regiones) y guardar el resultado un buen rato es lo que hace que alcance.
const TTL = 30 * 60 * 1000; // 30 minutos de caché
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

const getEvents = async () => {
  if (Date.now() - cache.at < TTL && cache.events.length) return cache.events;
  try {
    const { data } = await axios.get(`${BASE}/sports/upcoming/odds/`, {
      params: { regions: 'us', markets: 'h2h,totals', oddsFormat: 'decimal', apiKey: process.env.ODDS_API_KEY },
      timeout: 10000,
    });
    const events = data
      .map((ev) => {
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
      })
      .filter(Boolean)
      .filter((e) => new Date(e.commenceTime) > new Date());
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