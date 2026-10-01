const SportsBet = require('../models/SportsBet');
const odds = require('../services/oddsService');
const walletService = require('../services/walletService');
const { publicUser } = require('./authController');

exports.events = async (req, res, next) => {
  try {
    const events = await odds.getEvents();
    res.json({ events: events.slice(0, 40) });
  } catch (error) {
    next(error);
  }
};

exports.placeBet = async (req, res, next) => {
  try {
    const { eventId, pick } = req.body;
    const amount = Number(req.body.amount);

    const events = await odds.getEvents();
    const event = events.find((e) => e.id === eventId);
    if (!event) return res.status(400).json({ message: 'Evento no disponible' });
    if (new Date(event.commenceTime) <= new Date()) return res.status(400).json({ message: 'El evento ya comenzó' });

    const outcome = event.odds.find((o) => o.name === pick);
    if (!outcome) return res.status(400).json({ message: 'Selección inválida' });

    const user = await walletService.placeBet(req.user._id, amount, 'sports', { eventId, pick });
    const bet = await SportsBet.create({
      user: req.user._id,
      eventId,
      sportKey: event.sportKey,
      sportTitle: event.sportTitle,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTime: event.commenceTime,
      pick,
      odds: outcome.price, // la cuota la define el servidor, nunca el cliente
      amount,
      potentialWin: Math.floor(amount * outcome.price),
    });

    res.status(201).json({ bet, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.myBets = async (req, res, next) => {
  try {
    const bets = await SportsBet.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ bets });
  } catch (error) {
    next(error);
  }
};

// Revisa los resultados reales y liquida las apuestas pendientes del usuario
exports.settle = async (req, res, next) => {
  try {
    const pending = await SportsBet.find({ user: req.user._id, status: 'pending', commenceTime: { $lt: new Date() } });
    const keys = [...new Set(pending.map((b) => b.sportKey))];
    const scoresByEvent = {};

    for (const key of keys) {
      const list = await odds.getScores(key);
      list.forEach((ev) => { if (ev.completed && ev.scores) scoresByEvent[ev.id] = ev; });
    }

    let settled = 0;
    for (const bet of pending) {
      const ev = scoresByEvent[bet.eventId];
      if (!ev) continue;
      const home = Number(ev.scores.find((s) => s.name === ev.home_team)?.score);
      const away = Number(ev.scores.find((s) => s.name === ev.away_team)?.score);
      if (Number.isNaN(home) || Number.isNaN(away)) continue;

      const winner = home === away ? 'Draw' : home > away ? ev.home_team : ev.away_team;
      const won = bet.pick === winner;

      const updated = await SportsBet.findOneAndUpdate(
        { _id: bet._id, status: 'pending' },
        { status: won ? 'won' : 'lost', settledAt: new Date() }
      );
      if (updated && won) {
        await walletService.creditWin(req.user._id, bet.potentialWin, 'sports', { betId: bet._id });
      }
      settled++;
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    res.json({ settled, message: settled ? `Se liquidaron ${settled} apuestas` : 'Aún no hay resultados para tus apuestas', user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};