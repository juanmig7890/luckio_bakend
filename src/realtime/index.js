// Conexión en tiempo real (Socket.IO) de las mesas en vivo.
// Ruleta y Bacará (un solo resultado compartido):
//   cliente  table:join {table} · table:leave {table} · table:bet {table, bets}
//   servidor table:state · table:resolving · table:players · table:outcome (solo para quien apostó)
// Blackjack (6 sillas independientes, mismo crupier para todas):
//   cliente  bj:join · bj:leave · bj:sit {seat} · bj:standUp · bj:bet {seat, amount, pairsBet, threeBet}
//            bj:insurance {seat, take} · bj:action {seat, type: hit|stand|double|split|surrender}
//   servidor bj:state · bj:players · bj:outcome (solo para quien tenía una mano en esa silla)
const jwt = require('jsonwebtoken');
const RouletteTable = require('./rouletteTable');
const BaccaratTable = require('./baccaratTable');
const { BlackjackTable } = require('./blackjackTable');

const buildTables = (deps = {}) => {
  const wallet = deps.wallet || require('../services/walletService');
  const getUser = deps.getUser || ((id) => require('../models/User').findById(id));
  const toPublic = deps.publicUser || ((u) => require('../controllers/authController').publicUser(u));
  const shared = { wallet, getUser: async (id) => { const u = await getUser(id); return u ? toPublic(u) : null; }, durations: deps.durations, now: deps.now };
  return {
    roulette: new RouletteTable({ ...shared, deps: deps.roulette }),
    baccarat: new BaccaratTable({ ...shared, deps: deps.baccarat }),
    blackjack: new BlackjackTable({ ...shared, deps: deps.blackjack }),
  };
};

const defaultAuthenticate = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await require('../models/User').findById(decoded.id);
  if (!user) throw new Error('Usuario no encontrado');
  return user;
};

const attachRealtime = (httpServer, { tables = buildTables(), authenticate = defaultAuthenticate, origins } = {}) => {
  const { Server } = require('socket.io');
  const io = new Server(httpServer, {
    cors: { origin: origins || (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: true },
    maxHttpBufferSize: 20 * 1024,
  });

  // Solo entran usuarios con un token válido
  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticate(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('No autorizado'));
    }
  });

  const room = (id) => `table:${id}`;
  const bj = tables.blackjack;

  // Ruleta y Bacará: un solo resultado por ronda para todos (motor LiveTable)
  Object.values(tables)
    .filter((t) => t !== bj)
    .forEach((t) => {
      t.on('state', (snap) => io.to(room(t.id)).emit('table:state', snap));
      t.on('resolving', (snap) => io.to(room(t.id)).emit('table:resolving', snap));
      t.on('players', (p) => io.to(room(t.id)).emit('table:players', p));
      t.on('outcome', ({ userId, ...payload }) => io.to(`user:${userId}`).emit('table:outcome', payload));
    });

  // Blackjack: 6 sillas independientes, eventos propios para no mezclar la forma de los datos
  if (bj) {
    bj.on('state', (snap) => io.to(room(bj.id)).emit('bj:state', snap));
    bj.on('players', (p) => io.to(room(bj.id)).emit('bj:players', p));
    bj.on('outcome', ({ userId, ...payload }) => io.to(`user:${userId}`).emit('bj:outcome', payload));
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = String(user._id);
    const joined = new Set();
    let inBlackjack = false;
    socket.join(`user:${userId}`);

    const reply = (ack, body) => typeof ack === 'function' && ack(body);
    const fail = (ack, err) => reply(ack, { ok: false, status: err.status || 500, message: err.status ? err.message : 'Error en la mesa' });

    socket.on('table:join', (payload, ack) => {
      try {
        const table = tables[payload?.table];
        if (!table || table === bj) return reply(ack, { ok: false, status: 404, message: 'Mesa inexistente' });
        if (!joined.has(table.id)) {
          table.join(user);
          joined.add(table.id);
          socket.join(room(table.id));
        }
        reply(ack, { ok: true, state: table.snapshot() });
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('table:leave', (payload) => {
      const table = tables[payload?.table];
      if (table && table !== bj && joined.delete(table.id)) {
        table.leave(userId);
        socket.leave(room(table.id));
      }
    });

    socket.on('table:bet', async (payload, ack) => {
      try {
        const table = tables[payload?.table];
        if (!table || table === bj || !joined.has(table.id)) return reply(ack, { ok: false, status: 403, message: 'Primero siéntate en la mesa' });
        const { user: updated, mine } = await table.placeBets(userId, payload.bets);
        reply(ack, { ok: true, user: updated && require('../controllers/authController').publicUser(updated), mine });
      } catch (err) {
        fail(ack, err);
      }
    });

    // ---- Blackjack en vivo ----
    if (bj) {
      socket.on('bj:join', (payload, ack) => {
        try {
          bj.join();
          inBlackjack = true;
          socket.join(room(bj.id));
          reply(ack, { ok: true, state: bj.snapshot() });
        } catch (err) {
          fail(ack, err);
        }
      });

      socket.on('bj:leave', () => {
        if (!inBlackjack) return;
        bj.leave(userId);
        socket.leave(room(bj.id));
        inBlackjack = false;
      });

      socket.on('bj:sit', (payload, ack) => {
        try {
          const state = bj.seatSit(user, Number(payload?.seat));
          if (!inBlackjack) { inBlackjack = true; socket.join(room(bj.id)); } // por si se sienta sin haber llamado bj:join
          reply(ack, { ok: true, state });
        } catch (err) {
          fail(ack, err);
        }
      });

      socket.on('bj:standUp', (payload, ack) => {
        bj.standUp(userId);
        reply(ack, { ok: true });
      });

      socket.on('bj:bet', async (payload, ack) => {
        try {
          const { user: updated, round } = await bj.placeBet(userId, Number(payload?.seat), payload);
          reply(ack, { ok: true, user: updated && require('../controllers/authController').publicUser(updated), round });
        } catch (err) {
          fail(ack, err);
        }
      });

      socket.on('bj:insurance', async (payload, ack) => {
        try {
          const updated = await bj.insuranceDecision(userId, Number(payload?.seat), payload?.take === true);
          reply(ack, { ok: true, user: updated && require('../controllers/authController').publicUser(updated) });
        } catch (err) {
          fail(ack, err);
        }
      });

      socket.on('bj:action', async (payload, ack) => {
        try {
          const state = await bj.act(userId, Number(payload?.seat), payload?.type);
          reply(ack, { ok: true, state });
        } catch (err) {
          fail(ack, err);
        }
      });
    }

    socket.on('disconnect', () => {
      joined.forEach((id) => tables[id].leave(userId));
      joined.clear();
      if (bj && inBlackjack) {
        bj.leave(userId);
        inBlackjack = false;
      }
    });
  });

  return { io, tables };
};

module.exports = { attachRealtime, buildTables };
