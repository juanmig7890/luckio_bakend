const SportsBet = require('../models/SportsBet');
const ParlayBet = require('../models/ParlayBet');
const odds = require('../services/oddsService');
const rules = require('../services/sportsRules');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

const MAX_LEGS = 10;

const sendError = (status, message) => Object.assign(new Error(message), { status });

exports.events = async (req, res, next) => {
  try {
    const events = await odds.getEvents();
    const sorted = [...events].sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
    res.json({ events: sorted.slice(0, 150) });
  } catch (error) {
    next(error);
  }
};

// Busca el evento y valida la selección contra lo que de verdad ofrece ahora mismo (la cuota la decide el
// servidor, nunca el cliente). market por defecto es 'h2h' (ganador del partido) por compatibilidad.
const resolveSelection = (events, { eventId, market, pick, point }) => {
  const event = events.find((e) => e.id === eventId);
  if (!event) throw sendError(400, 'Evento no disponible');
  if (new Date(event.commenceTime) <= new Date()) throw sendError(400, 'El evento ya comenzó');

  const base = {
    eventId: event.id,
    sportKey: event.sportKey,
    sportTitle: event.sportTitle,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    commenceTime: event.commenceTime,
  };

  if (market === 'totals') {
    const outcome = event.totals.find((o) => o.name === pick && (point == null || o.point === Number(point)));
    if (!outcome) throw sendError(400, 'Esa línea de goles ya no está disponible');
    return { ...base, market: 'totals', pick, point: outcome.point, odds: outcome.price };
  }

  const outcome = event.odds.find((o) => o.name === pick);
  if (!outcome) throw sendError(400, 'Selección inválida');
  return { ...base, market: 'h2h', pick, point: null, odds: outcome.price };
};

exports.placeBet = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const events = await odds.getEvents();
    const sel = resolveSelection(events, req.body);

    const user = await walletService.placeBet(req.user._id, amount, 'sports', { eventId: sel.eventId, market: sel.market, pick: sel.pick });
    const bet = await SportsBet.create({ user: req.user._id, ...sel, amount, potentialWin: Math.floor(amount * sel.odds) });

    res.status(201).json({ bet, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

// Combinada: varias selecciones de partidos DISTINTOS en una sola apuesta; las cuotas se multiplican y
// hay que acertar todas para cobrar.
exports.placeParlay = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const rawLegs = Array.isArray(req.body.legs) ? req.body.legs : [];
    if (rawLegs.length < 2) throw sendError(400, 'Una combinada necesita al menos 2 selecciones');
    if (rawLegs.length > MAX_LEGS) throw sendError(400, `Máximo ${MAX_LEGS} selecciones por combinada`);

    const seen = new Set();
    for (const leg of rawLegs) {
      if (seen.has(leg.eventId)) throw sendError(400, 'No puedes repetir el mismo partido en una combinada');
      seen.add(leg.eventId);
    }

    const events = await odds.getEvents();
    const legs = rawLegs.map((leg) => resolveSelection(events, leg));
    const combinedOdds = Math.round(legs.reduce((p, leg) => p * leg.odds, 1) * 100) / 100;
    const potentialWin = Math.floor(amount * combinedOdds);

    const user = await walletService.placeBet(req.user._id, amount, 'sports', { parlay: true, legs: legs.length });
    const bet = await ParlayBet.create({ user: req.user._id, legs, combinedOdds, amount, potentialWin });

    res.status(201).json({ bet, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.myBets = async (req, res, next) => {
  try {
    const [bets, parlays] = await Promise.all([
      SportsBet.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
      ParlayBet.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
    ]);
    res.json({ bets, parlays });
  } catch (error) {
    next(error);
  }
};

// Revisa los resultados reales y liquida las apuestas pendientes del usuario (sencillas y combinadas)
exports.settle = async (req, res, next) => {
  try {
    const now = new Date();
    const [pendingSingles, pendingParlays] = await Promise.all([
      SportsBet.find({ user: req.user._id, status: 'pending', commenceTime: { $lt: now } }),
      ParlayBet.find({ user: req.user._id, status: 'pending', 'legs.commenceTime': { $lt: now } }),
    ]);

    const keys = new Set([...pendingSingles.map((b) => b.sportKey), ...pendingParlays.flatMap((p) => p.legs.map((l) => l.sportKey))]);
    const scoresByEvent = {};
    for (const key of keys) {
      const list = await odds.getScores(key);
      list.forEach((ev) => {
        if (ev.completed && ev.scores) scoresByEvent[ev.id] = ev;
      });
    }

    let settled = 0;

    for (const bet of pendingSingles) {
      const scoreEvent = scoresByEvent[bet.eventId];
      if (!scoreEvent) continue;
      const result = rules.resolveLeg(bet, scoreEvent);
      if (!result) continue;

      const updated = await SportsBet.findOneAndUpdate({ _id: bet._id, status: 'pending' }, { status: result, settledAt: new Date() });
      if (!updated) continue;
      settled++;
      const payout = rules.payoutFor(result, bet.amount, bet.potentialWin);
      if (payout > 0) await walletService.creditWin(req.user._id, payout, 'sports', { betId: bet._id, result });
    }

    for (const parlay of pendingParlays) {
      const results = parlay.legs.map((leg) => {
        const scoreEvent = scoresByEvent[leg.eventId];
        return scoreEvent ? rules.resolveLeg(leg, scoreEvent) : null;
      });
      if (results.some((r) => r === null)) continue; // todavía falta algún partido por terminar

      parlay.legs.forEach((leg, i) => {
        leg.status = results[i];
      });
      const lost = results.some((r) => r === 'lost');
      parlay.status = lost ? 'lost' : 'won';
      parlay.settledAt = new Date();
      await parlay.save();
      settled++;

      if (!lost) {
        // Una pata que empujó (push) no gana ni pierde: se cobra como si esa selección tuviera cuota 1 (se
        // devuelve su parte sin multiplicar), así que se saca del producto de cuotas antes de pagar.
        const pushFactor = parlay.legs.reduce((p, leg, i) => (results[i] === 'push' ? p / leg.odds : p), 1);
        const payout = Math.floor(parlay.amount * parlay.combinedOdds * pushFactor);
        if (payout > 0) await walletService.creditWin(req.user._id, payout, 'sports', { parlayId: parlay._id });
      }
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    res.json({ settled, message: settled ? `Se liquidaron ${settled} apuestas` : 'Aún no hay resultados para tus apuestas', user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};
