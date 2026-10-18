// Mesa en vivo compartida: UN solo resultado por ronda para todos los jugadores sentados.
// Es "autoritativa": el servidor decide cuándo se cierran las apuestas, sortea el resultado y paga.
// Fases:  betting (se apuesta) -> resolving (resultado sorteado, los clientes lo animan) -> results (se ven los pagos) -> betting ...
// Esta clase no sabe nada de Socket.IO: solo emite eventos. Así se puede probar sin red ni base de datos.
const { EventEmitter } = require('events');

const DEFAULT_DURATIONS = { betMs: 20000, resolveMs: 7000, resultMs: 4000 };
const MAX_PLAYERS = 100;
const MAX_ROUND_TOTAL = 100000; // tope por jugador y ronda (igual que en la mesa individual)

const httpError = (status, message) => Object.assign(new Error(message), { status });

class LiveTable extends EventEmitter {
  constructor({ id, game, wallet, getUser, durations = {}, now = Date.now }) {
    super();
    this.id = id;
    this.game = game;
    this.wallet = wallet;
    this.getUser = getUser;
    this.now = now;
    this.durations = { ...DEFAULT_DURATIONS, ...durations };

    this.phase = 'idle';
    this.roundNo = 0;
    this.endsAt = null;
    this.phaseMs = 0; // duración total de la fase actual (para dibujar la cuenta regresiva)
    this.seats = new Map(); // userId -> { username, connections }
    this.bets = new Map(); // userId -> { username, items, total }
    this.inflight = new Set(); // apuestas que ya se están cobrando
    this.history = [];
    this.current = null; // resultado público de la ronda en curso
    this.locks = new Map(); // userId -> última apuesta en cola (las de un mismo jugador se procesan una tras otra)
    this.timer = null;
    this.playersTimer = null;
    // Sin al menos un oyente, emit('error') tumbaría el servidor: aquí solo se registra
    this.on('error', (err) => console.error(`[mesa ${id}]`, err.message));
  }

  // ---- Métodos que implementa cada juego ----
  normalize() { throw new Error('normalize() lo implementa cada mesa'); }
  merge() { throw new Error('merge() lo implementa cada mesa'); }
  totalOf() { throw new Error('totalOf() lo implementa cada mesa'); }
  async draw() { throw new Error('draw() lo implementa cada mesa'); }
  historyEntry(result) { return result; }

  // ---- Presencia ----
  join(user) {
    const id = String(user._id ?? user.id);
    const seat = this.seats.get(id);
    if (seat) seat.connections++;
    else {
      if (this.seats.size >= MAX_PLAYERS) throw httpError(409, 'La mesa está llena');
      this.seats.set(id, { username: user.username, connections: 1 });
    }
    this.touchPlayers();
    if (this.phase === 'idle') this.startRound();
  }

  leave(userId) {
    const id = String(userId);
    const seat = this.seats.get(id);
    if (!seat) return;
    seat.connections--;
    if (seat.connections <= 0) this.seats.delete(id);
    this.touchPlayers();
    // Mesa vacía y nadie apostó: se detiene para no gastar recursos
    if (this.seats.size === 0 && this.bets.size === 0 && this.phase === 'betting') this.stop();
  }

  // ---- Estado visible para todos ----
  players() {
    return [...this.seats.entries()].map(([id, s]) => ({ id, name: s.username, bet: this.bets.get(id)?.total || 0 }));
  }

  snapshot() {
    return {
      table: this.id,
      phase: this.phase,
      round: this.roundNo,
      endsAt: this.endsAt,
      phaseMs: this.phaseMs,
      serverNow: this.now(),
      players: this.players(),
      history: this.history,
      result: this.phase === 'resolving' || this.phase === 'results' ? this.current : null,
    };
  }

  // Avisa que cambió la lista de jugadores/apuestas (agrupado para no saturar con muchos eventos seguidos)
  touchPlayers() {
    if (this.playersTimer) return;
    this.playersTimer = setTimeout(() => {
      this.playersTimer = null;
      this.emit('players', { table: this.id, players: this.players() });
    }, 120);
    this.playersTimer.unref?.();
  }

  // ---- Apuestas ----
  // Las apuestas de un mismo jugador se atienden de a una (si hace doble clic no se pisan entre sí)
  placeBets(userId, raw) {
    const id = String(userId);
    const prev = this.locks.get(id) || Promise.resolve();
    const job = prev.catch(() => {}).then(() => this.placeNow(id, raw));
    this.locks.set(id, job);
    this.inflight.add(job);
    const cleanup = () => {
      this.inflight.delete(job);
      if (this.locks.get(id) === job) this.locks.delete(id);
    };
    job.then(cleanup, cleanup);
    return job;
  }

  async placeNow(id, raw) {
    const seat = this.seats.get(id);
    if (!seat) throw httpError(403, 'Primero siéntate en la mesa');
    if (this.phase !== 'betting' || this.now() >= this.endsAt) throw httpError(409, 'Las apuestas están cerradas');

    const incoming = this.normalize(raw);
    const entry = this.bets.get(id) || { username: seat.username, items: null, total: 0 };
    const merged = this.merge(entry.items, incoming);
    const added = this.totalOf(incoming);
    if (entry.total + added > MAX_ROUND_TOTAL) throw httpError(400, 'El total apostado en la ronda no puede superar 100,000');

    // Un solo cobro por todo lo apostado: si no alcanza el saldo, no se cobra nada y no se registra nada
    const round = this.roundNo;
    const user = await this.wallet.placeBet(id, added, this.game, { live: true, table: this.id, round });
    this.bets.set(id, { username: seat.username, items: merged, total: entry.total + added });
    this.touchPlayers();
    return { user, mine: { items: merged, total: entry.total + added }, round };
  }

  // ---- Ciclo de la ronda ----
  startRound() {
    clearTimeout(this.timer);
    this.roundNo++;
    this.phase = 'betting';
    this.bets = new Map();
    this.current = null;
    this.endsAt = this.now() + this.durations.betMs;
    this.phaseMs = this.durations.betMs;
    this.emit('state', this.snapshot());
    this.touchPlayers();
    this.timer = setTimeout(() => this.resolve().catch((e) => this.emit('error', e)), this.durations.betMs);
  }

  async resolve() {
    this.phase = 'resolving'; // desde aquí ya no se aceptan apuestas nuevas
    await Promise.allSettled([...this.inflight]); // las que ya estaban cobrándose entran en esta ronda

    const entries = new Map(this.bets);
    let drawn;
    try {
      drawn = await this.draw(entries);
    } catch (err) {
      // Si el sorteo falla (p. ej. la base de datos) se devuelve lo apostado y la mesa sigue funcionando
      this.emit('error', err);
      for (const [userId, entry] of entries) {
        await this.wallet.creditWin(userId, entry.total, this.game, { live: true, table: this.id, refund: true }).catch((e) => this.emit('error', e));
      }
      return this.seats.size > 0 ? this.startRound() : this.stop();
    }
    const { result, settlements } = drawn;
    this.current = result;
    this.history = [this.historyEntry(result), ...this.history].slice(0, 30);

    // Se acredita YA en el servidor (aunque el jugador se desconecte); los clientes lo ven al terminar la animación
    const outcomes = [];
    for (const [userId, s] of settlements) {
      try {
        if (s.totalWin > 0) await this.wallet.creditWin(userId, s.totalWin, this.game, { live: true, table: this.id, round: this.roundNo, ...s.meta });
      } catch (err) {
        this.emit('error', err);
      }
      outcomes.push([userId, s]);
    }

    this.endsAt = this.now() + this.durations.resolveMs;
    this.phaseMs = this.durations.resolveMs;
    this.emit('resolving', this.snapshot());

    this.timer = setTimeout(async () => {
      for (const [userId, s] of outcomes) {
        let user = null;
        try { user = await this.getUser(userId); } catch (err) { this.emit('error', err); }
        this.emit('outcome', { table: this.id, userId, round: this.roundNo, ...s.detail, totalBet: s.totalBet, totalWin: s.totalWin, user });
      }
      this.phase = 'results';
      this.endsAt = this.now() + this.durations.resultMs;
      this.phaseMs = this.durations.resultMs;
      this.emit('state', this.snapshot());
      this.timer = setTimeout(() => (this.seats.size > 0 ? this.startRound() : this.stop()), this.durations.resultMs);
    }, this.durations.resolveMs);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'idle';
    this.endsAt = null;
    this.bets = new Map();
    this.emit('state', this.snapshot());
  }
}

module.exports = { LiveTable, httpError, MAX_ROUND_TOTAL, DEFAULT_DURATIONS };
