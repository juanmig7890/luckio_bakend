// Conexión en tiempo real (Socket.IO) de las mesas en vivo.
// Eventos del cliente:  table:join {table}  ·  table:leave {table}  ·  table:bet {table, bets}
// Eventos del servidor: table:state · table:resolving · table:players · table:outcome (solo para quien apostó)
const jwt = require('jsonwebtoken');
const RouletteTable = require('./rouletteTable');
const BaccaratTable = require('./baccaratTable');

const buildTables = (deps = {}) => {
  const wallet = deps.wallet || require('../services/walletService');
  const getUser = deps.getUser || ((id) => require('../models/User').findById(id));
  const toPublic = deps.publicUser || ((u) => require('../controllers/authController').publicUser(u));
  const shared = { wallet, getUser: async (id) => { const u = await getUser(id); return u ? toPublic(u) : null; }, durations: deps.durations, now: deps.now };
  return {
    roulette: new RouletteTable({ ...shared, deps: deps.roulette }),
    baccarat: new BaccaratTable({ ...shared, deps: deps.baccarat }),
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
  Object.values(tables).forEach((t) => {
    t.on('state', (snap) => io.to(room(t.id)).emit('table:state', snap));
    t.on('resolving', (snap) => io.to(room(t.id)).emit('table:resolving', snap));
    t.on('players', (p) => io.to(room(t.id)).emit('table:players', p));
    t.on('outcome', ({ userId, ...payload }) => io.to(`user:${userId}`).emit('table:outcome', payload));
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = String(user._id);
    const joined = new Set();
    socket.join(`user:${userId}`);

    const reply = (ack, body) => typeof ack === 'function' && ack(body);
    const fail = (ack, err) => reply(ack, { ok: false, status: err.status || 500, message: err.status ? err.message : 'Error en la mesa' });

    socket.on('table:join', (payload, ack) => {
      try {
        const table = tables[payload?.table];
        if (!table) return reply(ack, { ok: false, status: 404, message: 'Mesa inexistente' });
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
      if (table && joined.delete(table.id)) {
        table.leave(userId);
        socket.leave(room(table.id));
      }
    });

    socket.on('table:bet', async (payload, ack) => {
      try {
        const table = tables[payload?.table];
        if (!table || !joined.has(table.id)) return reply(ack, { ok: false, status: 403, message: 'Primero siéntate en la mesa' });
        const { user: updated, mine } = await table.placeBets(userId, payload.bets);
        reply(ack, { ok: true, user: updated && require('../controllers/authController').publicUser(updated), mine });
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('disconnect', () => {
      joined.forEach((id) => tables[id].leave(userId));
      joined.clear();
    });
  });

  return { io, tables };
};

module.exports = { attachRealtime, buildTables };
