// Entorno de pruebas de CAJA NEGRA sobre la API HTTP real (Express + rutas + validaciones + controladores + servicios).
// Lo único que se reemplaza es la base de datos MongoDB, por modelos en memoria que imitan a Mongoose
// (ids de 24 caracteres hexadecimales, error de duplicado 11000 y CastError con ids inválidos).
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = 'secreto-solo-para-pruebas';
const SALDO_INICIAL = 5000;

const mock = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
// La base real es asíncrona (cada consulta cede el turno). Esto lo imita para que las peticiones simultáneas se entrelacen.
const io = () => new Promise((r) => setImmediate(r));
const nuevoId = () => crypto.randomBytes(12).toString('hex');
const clon = (o) => structuredClone(o);

// Resultado "encadenable" como las consultas de Mongoose: find().sort().limit().select().lean()
const consulta = (rows) => {
  let data = rows;
  const q = {
    sort: () => q,
    limit: (n) => { data = data.slice(0, n); return q; },
    select: () => q,
    lean: () => Promise.resolve(data.map(clon)),
    then: (a, b) => Promise.resolve(data.map(clon)).then(a, b),
  };
  return q;
};

const castError = (valor, modelo) =>
  Object.assign(new Error(`Cast to ObjectId failed for value "${valor}" (type string) at path "_id" for model "${modelo}"`), { name: 'CastError' });
const esObjectId = (v) => /^[0-9a-f]{24}$/.test(String(v));

function crearBaseDeDatos() {
  const db = { users: new Map(), tx: [], spins: [], rounds: [], games: new Map(), pozo: 1000 };

  class User {
    constructor(d) { Object.assign(this, { balance: 0, totalWagered: 0, vipLevel: 'Bronce', createdAt: new Date() }, d); }
    static async create(d) {
      await io();
      const todos = [...db.users.values()];
      if (todos.some((u) => u.email === String(d.email).toLowerCase())) throw Object.assign(new Error('E11000'), { code: 11000, keyValue: { email: d.email } });
      if (todos.some((u) => u.username === d.username)) throw Object.assign(new Error('E11000'), { code: 11000, keyValue: { username: d.username } });
      const u = new User({ _id: nuevoId(), ...d, email: String(d.email).toLowerCase(), password: await bcrypt.hash(String(d.password), 4) });
      db.users.set(u._id, u);
      return u;
    }
    static findOne(q) {
      const p = io().then(() => [...db.users.values()].find((x) => x.email === q.email) || null);
      p.select = () => p;
      return p;
    }
    static async findById(id) { await io(); return db.users.get(id) || null; }
    static async findOneAndUpdate(filtro, update) {
      await io();
      const u = db.users.get(filtro._id);
      if (!u) return null;
      if (filtro.balance && filtro.balance.$gte !== undefined && !(u.balance >= filtro.balance.$gte)) return null;
      Object.entries(update.$inc || {}).forEach(([k, v]) => { u[k] += v; });
      return u;
    }
    static async findByIdAndUpdate(id, update) {
      await io();
      const u = db.users.get(id);
      if (!u) return null;
      Object.entries(update.$inc || {}).forEach(([k, v]) => { u[k] += v; });
      return u;
    }
    async save() { return this; }
    comparePassword(c) { return bcrypt.compare(c, this.password); }
  }

  const Transaction = {
    create: async (d) => { await io(); db.tx.push({ _id: nuevoId(), createdAt: new Date(), ...d }); return d; },
    find: (q) => consulta(db.tx.filter((t) => t.user === q.user).slice().reverse()),
  };
  const RouletteSpin = {
    create: async (d) => { await io(); db.spins.push({ ...d, createdAt: new Date() }); return d; },
    find: () => consulta(db.spins.slice().reverse()),
  };
  const BaccaratRound = {
    create: async (d) => { await io(); db.rounds.push({ ...d, createdAt: new Date() }); return d; },
    find: (q) => consulta(db.rounds.filter((r) => r.user === q.user).slice().reverse()),
  };
  const Jackpot = {
    findOneAndUpdate: async (f, u, o = {}) => {
      const antes = db.pozo;
      if (u.$inc) db.pozo += u.$inc.amount;
      if (u.$set && u.$set.amount != null) db.pozo = u.$set.amount;
      return { amount: o.new === false ? antes : db.pozo };
    },
    updateOne: async () => ({}),
  };

  const DEFAULTS = { status: 'active', result: null, payout: 0, pairsBet: 0, pairsType: null, pairsPayout: 0, threeBet: 0, threeType: null, threePayout: 0, insurance: 'none', insuranceBet: 0, insurancePayout: 0, isHistoricBlackjack: false };
  const coincide = (g, q) => Object.entries(q).every(([k, v]) => g[k] === v);
  class BlackjackGame {
    constructor(d) { Object.assign(this, DEFAULTS, d); }
    markModified() {}
    async save() { await io(); db.games.set(this._id, clon({ ...this })); return this; }
    static async create(d) { await io(); const g = new BlackjackGame({ _id: nuevoId(), createdAt: new Date(), ...d }); db.games.set(g._id, clon({ ...g })); return new BlackjackGame(clon({ ...g })); }
    static async findOne(q) {
      if (q._id !== undefined && !esObjectId(q._id)) throw castError(q._id, 'BlackjackGame');
      await io();
      const g = [...db.games.values()].find((x) => coincide(x, q));
      return g ? new BlackjackGame(clon(g)) : null;
    }
    static async findOneAndUpdate(f, u) {
      await io();
      const g = [...db.games.values()].find((x) => coincide(x, f));
      if (!g) return null;
      Object.assign(g, clon(u.$set));
      return new BlackjackGame(clon(g));
    }
  }
  return { db, User, Transaction, RouletteSpin, BaccaratRound, Jackpot, BlackjackGame };
}

// Crea el servidor y devuelve el "contexto" que usan los casos de prueba.
async function crearEntorno() {
  process.env.JWT_SECRET = SECRET;
  process.env.INITIAL_BALANCE = String(SALDO_INICIAL);
  process.env.NODE_ENV = 'production'; // silencia el log de morgan

  const m = crearBaseDeDatos();
  mock('../../src/models/User', m.User);
  mock('../../src/models/Transaction', m.Transaction);
  mock('../../src/models/RouletteSpin', m.RouletteSpin);
  mock('../../src/models/BaccaratRound', m.BaccaratRound);
  mock('../../src/models/Jackpot', m.Jackpot);
  mock('../../src/models/BlackjackGame', m.BlackjackGame);

  const cards = require('../../src/services/cards');
  const buildShoeReal = cards.buildShoe;
  const randomIntReal = crypto.randomInt;
  const app = require('../../src/app');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  let contador = 0;
  const ctx = {
    db: m.db, base, SECRET, SALDO_INICIAL, cards,
    sufijo: () => `${Date.now().toString(36)}${(contador++).toString(36)}`,

    // Llamada HTTP: devuelve { status, body, headers }
    async api(metodo, ruta, { body, token, headers = {}, raw } = {}) {
      const h = { ...headers };
      if (token) h.Authorization = `Bearer ${token}`;
      if (body !== undefined && raw === undefined) h['Content-Type'] = 'application/json';
      const res = await fetch(base + ruta, { method: metodo, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
      let json = null;
      try { json = await res.json(); } catch { /* sin cuerpo JSON */ }
      return { status: res.status, body: json, headers: res.headers };
    },

    // Crea un usuario directamente en la base simulada y devuelve su token
    async usuario({ balance = 10000, totalWagered = 0, vipLevel = 'Bronce' } = {}) {
      const n = ctx.sufijo();
      const u = await m.User.create({ username: `u${n}`.slice(0, 20), email: `u${n}@prueba.co`, password: 'clave123' });
      u.balance = balance; u.totalWagered = totalWagered; u.vipLevel = vipLevel;
      return { id: u._id, token: jwt.sign({ id: u._id }, SECRET, { expiresIn: '1h' }), doc: u };
    },
    saldo: (id) => m.db.users.get(id).balance,

    // Control del azar (para que el resultado esperado sea determinista): valores que devolverá crypto.randomInt
    sorteo(valores) {
      const cola = [].concat(valores);
      crypto.randomInt = () => (cola.length > 1 ? cola.shift() : cola[0]);
    },
    sorteoReal() { crypto.randomInt = randomIntReal; },
    // Mazo arreglado: las primeras cartas son las indicadas; después se completa con cartas bajas
    mazo(...codigos) {
      const relleno = Array.from({ length: 60 }, (_, i) => ['2C', '3D', '2H', '3S'][i % 4]);
      cards.buildShoe = () => [...codigos, ...relleno];
    },
    mazoReal() { cards.buildShoe = buildShoeReal; },
    setPozo: (n) => { m.db.pozo = n; },
    pozo: () => m.db.pozo,
  };
  ctx.cerrar = () => new Promise((r) => server.close(r));
  return ctx;
}

module.exports = { crearEntorno };
