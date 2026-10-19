// Mesa de Blackjack en vivo: 6 sillas independientes compartiendo un mismo crupier.
// A diferencia de la ruleta/bacará (un solo resultado para todos), aquí cada silla reparte SUS propias
// cartas y decide SUS propias jugadas (pedir, plantarse, doblar, dividir, retirarse); solo el crupier es
// compartido por toda la mesa. Las reglas (reparto, pagos, probabilidades) son EXACTAMENTE las mismas que
// la mesa individual (services/blackjackRules + services/cards): nada aquí favorece ni perjudica al jugador
// más de lo que ya hace el blackjack real, así que la mesa es tan nivelada como la de un casino de verdad.
const { EventEmitter } = require('events');
const cards = require('../services/cards');
const rules = require('../services/blackjackRules');

const SEAT_COUNT = 6;
const MIN_BET = 10;
const MAX_BET = 100000;
const DECKS = 6;
const RESHUFFLE_BELOW = 60; // por debajo de esto se arma un zapato nuevo antes de repartir (igual que una mesa real)

const DEFAULT_DURATIONS = {
  betMs: 20000,
  insuranceMs: 10000,
  turnMs: 15000,
  dealerMs: 2200,
  resultMs: 6000,
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

class BlackjackTable extends EventEmitter {
  constructor({ id = 'blackjack', wallet, getUser, durations = {}, now = Date.now, deps = {} } = {}) {
    super();
    this.id = id;
    this.game = 'blackjack';
    this.wallet = wallet;
    this.getUser = getUser;
    this.now = now;
    this.durations = { ...DEFAULT_DURATIONS, ...durations };
    this.deps = { buildShoe: () => cards.buildShoe(DECKS), ...deps };

    this.phase = 'idle';
    this.roundNo = 0;
    this.endsAt = null;
    this.phaseMs = 0;
    this.seats = new Map(); // seat(0-5) -> { userId, username }
    this.roundSeats = new Map(); // seat -> datos de la ronda en curso (apuestas, manos...)
    this.shoe = [];
    this.dealerCards = [];
    this.dealerRevealed = false;
    this.currentTurn = null; // { seat, hand }
    this.history = [];
    this.timer = null;
    this.playersTimer = null;
    this.turnLock = Promise.resolve(); // las acciones de turno se procesan de a una (evita pisadas con el auto-plantarse)
    this.inflightBets = new Set(); // apuestas que ya se están cobrando cuando se cierra la fase de apuestas
    this.on('error', (err) => console.error(`[blackjack ${id}]`, err.message));
  }

  // ---- Presencia: cualquiera puede mirar; sentarse es aparte (seatSit) ----
  join() {
    this.touchPlayers();
    if (this.phase === 'idle') this.startRound();
  }

  leave(userId) {
    this.standUp(userId);
  }

  seatSit(user, seat) {
    const id = String(user._id ?? user.id);
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) throw httpError(400, 'Silla inválida');
    if ([...this.seats.values()].some((s) => s.userId === id)) throw httpError(409, 'Ya estás sentado en otra silla');
    if (this.seats.has(seat)) throw httpError(409, 'Esa silla ya está ocupada');
    // Solo se puede sentar cuando no hay una mano en curso: evita pisar una silla que se liberó a mitad de ronda
    if (!['betting', 'results', 'idle'].includes(this.phase)) throw httpError(409, 'Espera a que termine la ronda para sentarte');
    this.seats.set(seat, { userId: id, username: user.username });
    this.touchPlayers();
    if (this.phase === 'idle') this.startRound();
    return this.snapshot();
  }

  standUp(userId) {
    const id = String(userId);
    for (const [seat, s] of this.seats) {
      if (s.userId === id) this.seats.delete(seat);
    }
    this.touchPlayers();
    if (this.seats.size === 0 && this.roundSeats.size === 0 && this.phase === 'betting') this.stop();
  }

  // Saca una carta del zapato; si por una ronda enorme (muchas divisiones) se agotara, arma uno nuevo al vuelo
  // en vez de reventar la mesa (igual de aleatorio, solo que un poco antes de lo normal).
  drawCard() {
    if (this.shoe.length === 0) this.shoe = this.deps.buildShoe();
    return cards.draw(this.shoe, 1)[0];
  }

  seatOf(userId) {
    const id = String(userId);
    for (const [seat, s] of this.seats) if (s.userId === id) return seat;
    return null;
  }

  touchPlayers() {
    if (this.playersTimer) return;
    this.playersTimer = setTimeout(() => {
      this.playersTimer = null;
      this.emit('players', { table: this.id, players: this.players() });
    }, 120);
    this.playersTimer.unref?.();
  }

  players() {
    return [...this.seats.entries()].map(([seat, s]) => ({
      id: s.userId,
      seat,
      name: s.username,
      bet: this.roundSeats.get(seat)?.totalBet || 0,
    }));
  }

  // ---- Vista pública de una mano (oculta nada: en blackjack todas las cartas de los jugadores son visibles) ----
  // Los "can*" solo importan para la mano activa (de quien le toca jugar): el cliente no tiene que
  // reimplementar las reglas de dividir/doblar/retirarse, solo mostrar u ocultar botones según esto.
  viewHand(h, active, handCount) {
    const canPlay = active && this.phase === 'playing';
    return {
      cards: h.cards,
      bet: h.bet,
      score: rules.handScore(h.cards),
      done: h.done,
      doubled: h.doubled,
      fromSplit: h.fromSplit,
      charlie: rules.isCharlie(h.cards),
      result: h.result,
      payout: h.payout,
      active,
      canHit: canPlay && !h.splitAce,
      canDouble: canPlay && h.cards.length === 2 && !h.splitAce,
      canSplit: canPlay && rules.canSplit(h, handCount),
      canSurrender: canPlay && handCount === 1 && h.cards.length === 2,
    };
  }

  viewSeat(seat) {
    const occ = this.seats.get(seat);
    const rs = this.roundSeats.get(seat);
    if (!occ && !rs) return null;
    return {
      seat,
      userId: rs?.userId || occ?.userId || null,
      name: rs?.username || occ?.username || null,
      sitting: Boolean(occ),
      mainBet: rs?.mainBet || 0,
      pairsBet: rs?.pairsBet || 0,
      threeBet: rs?.threeBet || 0,
      pairsType: rs?.pairsType || null,
      pairsPayout: rs?.pairsPayout || 0,
      threeType: rs?.threeType || null,
      threePayout: rs?.threePayout || 0,
      insurance: rs?.insurance || 'none',
      insuranceBet: rs?.insuranceBet || 0,
      insurancePayout: rs?.insurancePayout || 0,
      hands: rs ? rs.hands.map((h, i) => this.viewHand(h, this.isCurrentTurn(seat, i), rs.hands.length)) : [],
      activeHand: rs?.activeHand ?? 0,
    };
  }

  isCurrentTurn(seat, hand) {
    return Boolean(this.currentTurn && this.currentTurn.seat === seat && this.currentTurn.hand === hand);
  }

  dealerView() {
    const hidden = this.dealerCards.length > 0 && !this.dealerRevealed;
    const visible = hidden ? [this.dealerCards[0], { hidden: true }] : this.dealerCards;
    return { cards: visible, score: hidden ? rules.handScore([this.dealerCards[0]]) : rules.handScore(this.dealerCards) };
  }

  snapshot() {
    const seats = [];
    for (let s = 0; s < SEAT_COUNT; s++) seats.push(this.viewSeat(s));
    return {
      table: this.id,
      phase: this.phase,
      round: this.roundNo,
      endsAt: this.endsAt,
      phaseMs: this.phaseMs,
      serverNow: this.now(),
      seats,
      players: this.players(),
      dealer: this.dealerView(),
      turn: this.currentTurn,
      history: this.history,
      shoe: { remaining: this.shoe.length, size: DECKS * 52 },
    };
  }

  // ---- Apuestas: una sola vez por silla y por ronda (como poner las fichas antes de que reparta el crupier) ----
  // Se registra en "inflightBets" para que dealInitial() pueda esperar a que termine de cobrarse antes de repartir
  // (si no, una apuesta que llega justo cuando se cierra la mesa podría quedar a medio cobrar).
  placeBet(userId, seat, raw) {
    const job = this.placeBetNow(userId, seat, raw);
    this.inflightBets.add(job);
    const cleanup = () => this.inflightBets.delete(job);
    job.then(cleanup, cleanup);
    return job;
  }

  async placeBetNow(userId, seat, raw) {
    const id = String(userId);
    const occ = this.seats.get(seat);
    if (!occ || occ.userId !== id) throw httpError(403, 'Primero siéntate en esa silla');
    if (this.phase !== 'betting' || this.now() >= this.endsAt) throw httpError(409, 'Las apuestas están cerradas');
    if (this.roundSeats.has(seat)) throw httpError(409, 'Ya apostaste en esta ronda');

    const amount = Number(raw?.amount);
    const pairsBet = Number(raw?.pairsBet) || 0;
    const threeBet = Number(raw?.threeBet) || 0;
    if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) throw httpError(400, `La apuesta principal debe ser un entero entre ${MIN_BET} y ${MAX_BET}`);
    if (!Number.isInteger(pairsBet) || pairsBet < 0 || pairsBet > MAX_BET) throw httpError(400, 'Perfect Pairs debe ser un entero válido');
    if (!Number.isInteger(threeBet) || threeBet < 0 || threeBet > MAX_BET) throw httpError(400, '21+3 debe ser un entero válido');
    const total = amount + pairsBet + threeBet;
    if (total > MAX_BET) throw httpError(400, `El total apostado no puede superar ${MAX_BET}`);

    // Se reserva la silla ANTES de cobrar (de forma síncrona) para que un doble clic no alcance a cobrar dos veces
    this.roundSeats.set(seat, { userId: id, username: occ.username, pending: true, hands: [] });

    const round = this.roundNo;
    let user;
    try {
      user = await this.wallet.placeBet(id, total, this.game, { live: true, table: this.id, round, seat });
    } catch (err) {
      this.roundSeats.delete(seat);
      throw err;
    }
    this.roundSeats.set(seat, {
      userId: id,
      username: occ.username,
      mainBet: amount,
      pairsBet,
      threeBet,
      totalBet: total,
      pairsType: null,
      pairsPayout: 0,
      threeType: null,
      threePayout: 0,
      insurance: 'none',
      insuranceBet: 0,
      insurancePayout: 0,
      hands: [],
      activeHand: 0,
    });
    this.touchPlayers();
    return { user, round };
  }

  async insuranceDecision(userId, seat, take) {
    const id = String(userId);
    const rs = this.roundSeats.get(seat);
    if (!rs || rs.userId !== id) throw httpError(403, 'No tienes una mano en esa silla');
    if (this.phase !== 'insurance' || rs.insurance !== 'offered') throw httpError(409, 'No hay un seguro pendiente');

    if (take) {
      rs.insurance = 'pending'; // reserva síncrona: un doble clic no alcanza a cobrar dos veces
      const insuranceBet = rules.insuranceCost(rs.mainBet);
      let user;
      try {
        user = await this.wallet.placeBet(id, insuranceBet, this.game, { live: true, table: this.id, round: this.roundNo, seat, insurance: true });
      } catch (err) {
        rs.insurance = 'offered';
        throw err;
      }
      rs.insurance = 'taken';
      rs.insuranceBet = insuranceBet;
      this.emit('players', { table: this.id, players: this.players() });
      this.maybeAdvanceInsurance();
      return user;
    }
    rs.insurance = 'declined';
    this.maybeAdvanceInsurance();
    return null;
  }

  maybeAdvanceInsurance() {
    // "pending" = hay un cobro de seguro en curso (ver insuranceDecision): también cuenta como pendiente
    const pending = [...this.roundSeats.values()].some((rs) => rs.insurance === 'offered' || rs.insurance === 'pending');
    if (!pending) {
      clearTimeout(this.timer);
      this.afterInsurance().catch((e) => this.emit('error', e));
    } else {
      this.emit('state', this.snapshot());
    }
  }

  // ---- Acciones de turno: se serializan para que un timeout y un clic tardío no se pisen ----
  async act(userId, seat, type) {
    const job = this.turnLock.catch(() => {}).then(() => this.actNow(String(userId), seat, type));
    this.turnLock = job.catch(() => {});
    return job;
  }

  async actNow(id, seat, type) {
    if (this.phase !== 'playing' || !this.currentTurn || this.currentTurn.seat !== seat) throw httpError(409, 'No es tu turno');
    const rs = this.roundSeats.get(seat);
    if (!rs || rs.userId !== id) throw httpError(403, 'No tienes una mano en esa silla');
    const hand = rs.hands[this.currentTurn.hand];
    if (!hand || hand.done) throw httpError(409, 'Esa mano ya terminó');

    switch (type) {
      case 'hit': {
        if (hand.splitAce) throw httpError(400, 'Los Ases divididos solo reciben una carta');
        hand.cards.push(this.drawCard());
        rules.closeIfOver(hand);
        break;
      }
      case 'stand': {
        hand.done = true;
        break;
      }
      case 'double': {
        if (hand.cards.length !== 2) throw httpError(400, 'Solo puedes doblar con 2 cartas');
        if (hand.splitAce) throw httpError(400, 'No puedes doblar Ases divididos');
        await this.wallet.placeBet(id, hand.bet, this.game, { live: true, table: this.id, round: this.roundNo, seat, double: true });
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(this.drawCard());
        hand.done = true;
        if (rules.handScore(hand.cards) > 21) hand.result = 'lose';
        break;
      }
      case 'split': {
        if (!rules.canSplit(hand, rs.hands.length)) throw httpError(400, 'No puedes dividir esta mano');
        await this.wallet.placeBet(id, hand.bet, this.game, { live: true, table: this.id, round: this.roundNo, seat, split: true });
        const aces = hand.cards[0].value === 'ACE';
        const make = (c) => {
          const h = rules.newHand([c, this.drawCard()], hand.bet, { fromSplit: true, splitAce: aces });
          if (aces) h.done = true;
          else rules.closeIfOver(h);
          return h;
        };
        const [first, second] = hand.cards;
        rs.hands.splice(this.currentTurn.hand, 1, make(first), make(second));
        break;
      }
      case 'surrender': {
        if (rs.hands.length !== 1 || hand.cards.length !== 2) throw httpError(400, 'Solo puedes retirarte con tus 2 primeras cartas');
        hand.result = 'surrender';
        hand.done = true;
        break;
      }
      default:
        throw httpError(400, 'Acción inválida');
    }

    this.emit('state', this.snapshot());
    this.advanceTurn();
    return this.snapshot();
  }

  // ---- Ciclo de la ronda ----
  startRound() {
    clearTimeout(this.timer);
    this.roundNo++;
    this.phase = 'betting';
    this.roundSeats = new Map();
    this.dealerCards = [];
    this.dealerRevealed = false;
    this.currentTurn = null;
    this.endsAt = this.now() + this.durations.betMs;
    this.phaseMs = this.durations.betMs;
    this.emit('state', this.snapshot());
    this.touchPlayers();
    this.timer = setTimeout(() => {
      this.phase = 'dealing'; // se cierra la mesa YA (síncrono): ninguna apuesta nueva entra después de este punto
      this.dealInitial().catch((e) => this.emit('error', e));
    }, this.durations.betMs);
  }

  async dealInitial() {
    await Promise.allSettled([...this.inflightBets]); // las que ya estaban cobrándose entran en esta ronda
    if (this.roundSeats.size === 0) {
      // Nadie apostó: no tiene sentido repartir, se abre otra ronda de apuestas enseguida
      return this.seats.size > 0 ? this.startRound() : this.stop();
    }

    if (this.shoe.length < RESHUFFLE_BELOW) this.shoe = this.deps.buildShoe();
    const draw = () => this.drawCard();
    const seatIdx = [...this.roundSeats.keys()].sort((a, b) => a - b);

    // Reparto real: una carta a cada silla y otra al crupier, dos vueltas (como en una mesa física)
    for (let round = 0; round < 2; round++) {
      for (const seat of seatIdx) {
        const rs = this.roundSeats.get(seat);
        if (round === 0) rs.hands.push(rules.newHand([], rs.mainBet));
        rs.hands[0].cards.push(draw());
      }
      this.dealerCards.push(draw());
    }

    for (const seat of seatIdx) {
      const rs = this.roundSeats.get(seat);
      const playerCards = rs.hands[0].cards;
      if (rs.pairsBet > 0) {
        rs.pairsType = rules.evaluatePairs(playerCards);
        rs.pairsPayout = rs.pairsType ? rs.pairsBet * rules.PAIRS_PAYOUT[rs.pairsType] : 0;
      }
      if (rs.threeBet > 0) {
        rs.threeType = rules.evaluateTwentyOnePlusThree(playerCards, this.dealerCards[0]);
        rs.threePayout = rs.threeType ? rs.threeBet * rules.THREE_PAYOUT[rs.threeType] : 0;
      }
    }

    this.phase = 'dealing';
    this.phaseMs = 0;
    this.emit('state', this.snapshot());

    if (this.dealerCards[0].value === 'ACE') {
      for (const seat of seatIdx) this.roundSeats.get(seat).insurance = 'offered';
      this.phase = 'insurance';
      this.endsAt = this.now() + this.durations.insuranceMs;
      this.phaseMs = this.durations.insuranceMs;
      this.emit('state', this.snapshot());
      this.timer = setTimeout(() => this.afterInsurance().catch((e) => this.emit('error', e)), this.durations.insuranceMs);
      return;
    }

    return this.afterInsurance();
  }

  // Resuelve blackjacks naturales (y el seguro, si se ofreció) y arranca los turnos de quien siga en juego
  async afterInsurance() {
    clearTimeout(this.timer);
    const dealerBJ = rules.isBlackjack(this.dealerCards);
    for (const rs of this.roundSeats.values()) {
      if (rs.insurance === 'offered') rs.insurance = 'declined'; // nadie alcanzó a decidir: se da por no tomado
      if (dealerBJ && rs.insurance === 'taken') rs.insurancePayout = rs.insuranceBet * rules.INSURANCE_PAYOUT;

      const hand = rs.hands[0];
      const playerBJ = rules.isBlackjack(hand.cards);
      if (dealerBJ || playerBJ) {
        hand.done = true;
        hand.result = playerBJ && dealerBJ ? 'push' : playerBJ ? 'blackjack' : 'lose';
      }
    }
    if (dealerBJ) return this.dealerPhase().catch((e) => this.emit('error', e)); // con blackjack del crupier la ronda ya está decidida
    return this.advanceTurn();
  }

  // Busca la próxima mano sin terminar recorriendo las sillas en orden (igual que la mesa individual, pero entre sillas)
  nextTurn() {
    const seatIdx = [...this.roundSeats.keys()].sort((a, b) => a - b);
    for (const seat of seatIdx) {
      const idx = this.roundSeats.get(seat).hands.findIndex((h) => !h.done);
      if (idx >= 0) return { seat, hand: idx };
    }
    return null;
  }

  advanceTurn() {
    clearTimeout(this.timer);
    const next = this.nextTurn();
    if (!next) {
      this.currentTurn = null;
      return this.dealerPhase().catch((e) => this.emit('error', e));
    }
    this.currentTurn = next;
    this.phase = 'playing';
    this.endsAt = this.now() + this.durations.turnMs;
    this.phaseMs = this.durations.turnMs;
    this.emit('state', this.snapshot());
    this.timer = setTimeout(() => {
      // Nadie decidió a tiempo: se planta sola (igual que en una mesa real cuando pasa el turno)
      this.act(this.roundSeats.get(next.seat).userId, next.seat, 'stand').catch((e) => this.emit('error', e));
    }, this.durations.turnMs);
  }

  async dealerPhase() {
    clearTimeout(this.timer);
    const needsPlay = [...this.roundSeats.values()].some((rs) => rs.hands.some((h) => h.result === null));
    this.dealerRevealed = true;
    if (needsPlay) rules.dealerPlay(this.dealerCards, () => this.drawCard());

    this.phase = 'dealer';
    this.endsAt = this.now() + this.durations.dealerMs;
    this.phaseMs = this.durations.dealerMs;
    this.emit('state', this.snapshot());
    this.timer = setTimeout(() => this.settle().catch((e) => this.emit('error', e)), this.durations.dealerMs);
  }

  async settle() {
    const outcomes = [];
    for (const [seat, rs] of this.roundSeats) {
      let historic = false;
      rs.hands.forEach((h) => {
        if (h.result === null) h.result = rules.resolveByScores(h.cards, this.dealerCards);
        const { payout, historic: isHistoric } = rules.payoutFor(h);
        h.payout = payout;
        if (isHistoric) historic = true;
      });
      const handsWin = rs.hands.reduce((s, h) => s + h.payout, 0);
      const totalWin = handsWin + rs.pairsPayout + rs.threePayout + rs.insurancePayout;
      // Suma lo apostado en TODAS las manos (dividir y doblar cambian cuánto hay en juego) más laterales y seguro
      const totalBet = rs.hands.reduce((s, h) => s + h.bet, 0) + rs.pairsBet + rs.threeBet + rs.insuranceBet;
      try {
        if (totalWin > 0) await this.wallet.creditWin(rs.userId, totalWin, this.game, { live: true, table: this.id, round: this.roundNo, seat, historic });
      } catch (err) {
        this.emit('error', err);
      }
      outcomes.push([seat, rs.userId, {
        seat,
        hands: rs.hands.map((h) => ({ cards: h.cards, bet: h.bet, result: h.result, payout: h.payout, doubled: h.doubled, fromSplit: h.fromSplit })),
        pairsType: rs.pairsType,
        pairsPayout: rs.pairsPayout,
        threeType: rs.threeType,
        threePayout: rs.threePayout,
        insurance: rs.insurance,
        insuranceBet: rs.insuranceBet,
        insurancePayout: rs.insurancePayout,
        isHistoricBlackjack: historic,
        totalBet,
        totalWin,
      }]);
    }

    this.history = [this.historyEntry(), ...this.history].slice(0, 30);

    // Los pagos privados ("outcome") se mandan ANTES de anunciar la fase 'results': así quien espera a esa
    // fase (como el cliente) ya tiene todos sus pagos, sin una carrera entre el estado público y el privado.
    for (const [, userId, detail] of outcomes) {
      let user = null;
      try { user = await this.getUser(userId); } catch (err) { this.emit('error', err); }
      this.emit('outcome', { table: this.id, userId, round: this.roundNo, ...detail, user });
    }

    this.phase = 'results';
    this.endsAt = this.now() + this.durations.resultMs;
    this.phaseMs = this.durations.resultMs;
    this.emit('state', this.snapshot());

    this.timer = setTimeout(() => (this.seats.size > 0 ? this.startRound() : this.stop()), this.durations.resultMs);
  }

  historyEntry() {
    return {
      round: this.roundNo,
      dealerScore: rules.handScore(this.dealerCards),
      dealerCards: this.dealerCards,
      seats: [...this.roundSeats.entries()].map(([seat, rs]) => ({
        seat,
        results: rs.hands.map((h) => h.result),
      })),
    };
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'idle';
    this.endsAt = null;
    this.roundSeats = new Map();
    this.currentTurn = null;
    this.emit('state', this.snapshot());
  }
}

module.exports = { BlackjackTable, httpError, SEAT_COUNT, DEFAULT_DURATIONS };
