// Reglas puras de apuestas deportivas (sin red ni base de datos): decidir si una selección ganó, perdió o
// empujó (push) contra el marcador final real. Se usa tanto para apuestas sencillas como para cada pata de
// una combinada.

// scoreEvent es el objeto que devuelve The Odds API en /scores: { home_team, away_team, scores: [{name, score}] }
const finalScores = (scoreEvent) => {
  const home = Number(scoreEvent.scores?.find((s) => s.name === scoreEvent.home_team)?.score);
  const away = Number(scoreEvent.scores?.find((s) => s.name === scoreEvent.away_team)?.score);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;
  return { home, away };
};

// Devuelve 'won' | 'lost' | 'push', o null si el marcador todavía no está disponible.
const resolveLeg = (leg, scoreEvent) => {
  const scores = finalScores(scoreEvent);
  if (!scores) return null;
  const { home, away } = scores;

  if (leg.market === 'totals') {
    const total = home + away;
    if (total === leg.point) return 'push';
    const overWon = total > leg.point;
    return (leg.pick === 'Over') === overWon ? 'won' : 'lost';
  }

  // h2h: el pick es el nombre del equipo ganador, o "Draw"
  const winner = home === away ? 'Draw' : home > away ? scoreEvent.home_team : scoreEvent.away_team;
  return leg.pick === winner ? 'won' : 'lost';
};

// Cuánto se acredita por una selección ya resuelta (push devuelve la apuesta, lost no paga nada)
const payoutFor = (result, amount, potentialWin) => (result === 'won' ? potentialWin : result === 'push' ? amount : 0);

module.exports = { resolveLeg, payoutFor };
