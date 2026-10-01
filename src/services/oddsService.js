const axios = require('axios');

const BASE = 'https://api.the-odds-api.com/v4';
const TTL = 10 * 60 * 1000; // 10 minutos de caché para cuidar tu cuota gratuita
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
      params: { regions: 'us', markets: 'h2h', oddsFormat: 'decimal', apiKey: process.env.ODDS_API_KEY },
      timeout: 10000,
    });
    const events = data
      .map((ev) => {
        const market = ev.bookmakers?.[0]?.markets?.find((m) => m.key === 'h2h');
        if (!market) return null;
        return {
          id: ev.id,
          sportKey: ev.sport_key,
          sportTitle: ev.sport_title,
          commenceTime: ev.commence_time,
          homeTeam: ev.home_team,
          awayTeam: ev.away_team,
          odds: market.outcomes.map((o) => ({ name: o.name, price: o.price })),
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