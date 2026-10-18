// CAJA NEGRA · Cuentas, sesión, billetera y robustez general de la API
// Técnicas: EP = partición de equivalencia · VL = valores límite · TD = tabla de decisión · TE = transición de estados
const jwt = require('jsonwebtoken');
const { crearEntorno } = require('./entorno');

const caso = (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo: 'Cuentas y sesión', regla, objetivo, entrada, esperadoValor, run });
const caso2 = (modulo) => (id, tecnica, regla, objetivo, entrada, esperadoValor, run) => ({ id, tecnica, modulo, regla, objetivo, entrada, esperadoValor, run });
const wallet = caso2('Billetera');
const gen = caso2('API general');

const registrar = (ctx, extra = {}) => {
  const n = ctx.sufijo();
  return ctx.api('POST', '/api/auth/register', { body: { username: `j${n}`.slice(0, 20), email: `j${n}@prueba.co`, password: 'secreto1', ...extra } });
};
const solo = (res, ...campos) => Object.fromEntries(campos.map((c) => [c, res[c]]));

const casos = [
  // ── Registro: partición de equivalencia y valores límite ──
  caso('CN-AUTH-01', 'EP', 'RN: un registro válido crea la cuenta con el saldo inicial y devuelve token', 'Registro con datos válidos (clase válida)', 'usuario "j…", email válido, contraseña de 8 caracteres', { status: 201, token: true, saldo: 5000, vip: 'Bronce', sinPassword: true },
    async (ctx) => { const r = await registrar(ctx); return { status: r.status, token: typeof r.body.token === 'string' && r.body.token.length > 20, saldo: r.body.user?.balance, vip: r.body.user?.vipLevel, sinPassword: r.body.user && !('password' in r.body.user) }; }),
  caso('CN-AUTH-02', 'VL', 'RN: usuario de 3 a 20 caracteres', 'Usuario de 2 caracteres (justo debajo del mínimo)', 'username="ab"', { status: 400 },
    async (ctx) => ({ status: (await registrar(ctx, { username: 'ab' })).status })),
  caso('CN-AUTH-03', 'VL', 'RN: usuario de 3 a 20 caracteres', 'Usuario de 3 caracteres (mínimo exacto)', 'username="abc"', { status: 201 },
    async (ctx) => ({ status: (await registrar(ctx, { username: `a${ctx.sufijo()}`.slice(0, 3) })).status })),
  caso('CN-AUTH-04', 'VL', 'RN: usuario de 3 a 20 caracteres', 'Usuario de 20 caracteres (máximo exacto)', 'username de 20 caracteres', { status: 201 },
    async (ctx) => ({ status: (await registrar(ctx, { username: `x${ctx.sufijo()}`.padEnd(20, 'z').slice(0, 20) })).status })),
  caso('CN-AUTH-05', 'VL', 'RN: usuario de 3 a 20 caracteres', 'Usuario de 21 caracteres (justo encima del máximo)', 'username de 21 caracteres', { status: 400 },
    async (ctx) => ({ status: (await registrar(ctx, { username: 'u'.repeat(21) })).status })),
  caso('CN-AUTH-06', 'EP', 'RN: el usuario no puede estar vacío', 'Usuario formado solo por espacios (clase inválida)', 'username="    "', { status: 400 },
    async (ctx) => ({ status: (await registrar(ctx, { username: '    ' })).status })),
  caso('CN-AUTH-07', 'EP', 'RN: los espacios al inicio/fin del usuario se descartan', 'Usuario con espacios alrededor se guarda recortado', 'username="  pXXXX  "', { status: 201, recortado: true },
    async (ctx) => { const nombre = `p${ctx.sufijo()}`.slice(0, 12); const r = await registrar(ctx, { username: `  ${nombre}  ` }); return { status: r.status, recortado: r.body.user?.username === nombre }; }),
  caso('CN-AUTH-08', 'VL', 'RN: contraseña mínimo 6 caracteres', 'Contraseña de 5 caracteres (debajo del mínimo)', 'password="12345"', { status: 400 },
    async (ctx) => ({ status: (await registrar(ctx, { password: '12345' })).status })),
  caso('CN-AUTH-09', 'VL', 'RN: contraseña mínimo 6 caracteres', 'Contraseña de 6 caracteres (mínimo exacto)', 'password="123456"', { status: 201 },
    async (ctx) => ({ status: (await registrar(ctx, { password: '123456' })).status })),
  caso('CN-AUTH-10', 'EP', 'RN: el correo debe tener formato válido', 'Correo sin arroba (clase inválida)', 'email="correo.com"', { status: 400 },
    async (ctx) => ({ status: (await registrar(ctx, { email: 'correo.com' })).status })),
  caso('CN-AUTH-11', 'EP', 'RN: el correo es único', 'Correo ya registrado (clase inválida por duplicado)', 'segundo registro con el mismo email', { status: 400, mensaje: 'Ese email ya está registrado' },
    async (ctx) => { const a = await registrar(ctx); const r = await registrar(ctx, { email: a.body.user.email }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-12', 'EP', 'RN: el usuario es único', 'Usuario ya registrado (clase inválida por duplicado)', 'segundo registro con el mismo username', { status: 400, mensaje: 'Ese username ya está registrado' },
    async (ctx) => { const a = await registrar(ctx); const r = await registrar(ctx, { username: a.body.user.username }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-13', 'EP', 'RN: el correo no distingue mayúsculas', 'Registrar con mayúsculas y entrar con minúsculas', 'email "Mixto@Prueba.CO" → login "mixto@prueba.co"', { registro: 201, login: 200 },
    async (ctx) => { const n = ctx.sufijo(); const a = await ctx.api('POST', '/api/auth/register', { body: { username: `m${n}`.slice(0, 20), email: `Mixto${n}@Prueba.CO`, password: 'secreto1' } }); const l = await ctx.api('POST', '/api/auth/login', { body: { email: `mixto${n}@prueba.co`, password: 'secreto1' } }); return { registro: a.status, login: l.status }; }),
  caso('CN-AUTH-14', 'EP', 'RN: todos los datos son obligatorios', 'Cuerpo vacío (faltan todos los campos)', '{}', { status: 400 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/auth/register', { body: {} })).status })),

  // ── Login: tabla de decisión (¿correo existe?, ¿contraseña correcta?) ──
  caso('CN-AUTH-15', 'TD', 'Tabla R1: correo existe + contraseña correcta → entra', 'Login correcto', 'email registrado, contraseña correcta', { status: 200, token: true },
    async (ctx) => { const a = await registrar(ctx); const r = await ctx.api('POST', '/api/auth/login', { body: { email: a.body.user.email, password: 'secreto1' } }); return { status: r.status, token: Boolean(r.body.token) }; }),
  caso('CN-AUTH-16', 'TD', 'Tabla R2: correo existe + contraseña incorrecta → rechaza', 'Login con contraseña equivocada', 'email registrado, contraseña "mala"', { status: 401, mensaje: 'Correo o contraseña incorrectos' },
    async (ctx) => { const a = await registrar(ctx); const r = await ctx.api('POST', '/api/auth/login', { body: { email: a.body.user.email, password: 'mala-clave' } }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-17', 'TD', 'Tabla R3: correo NO existe → mismo mensaje (no revela si la cuenta existe)', 'Login con correo inexistente', 'email nunca registrado', { status: 401, mensaje: 'Correo o contraseña incorrectos' },
    async (ctx) => { const r = await ctx.api('POST', '/api/auth/login', { body: { email: `nadie${ctx.sufijo()}@prueba.co`, password: 'secreto1' } }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-18', 'EP', 'RN: la contraseña es obligatoria', 'Login sin contraseña', 'solo email', { status: 400 },
    async (ctx) => { const a = await registrar(ctx); return { status: (await ctx.api('POST', '/api/auth/login', { body: { email: a.body.user.email } })).status }; }),
  caso('CN-AUTH-19', 'EP', 'RN: el correo debe tener formato válido', 'Login con correo mal formado', 'email="sin-arroba"', { status: 400 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/auth/login', { body: { email: 'sin-arroba', password: 'x' } })).status })),

  // ── Sesión: transición de estados del token ──
  caso('CN-AUTH-20', 'TE', 'RN: las rutas privadas exigen sesión', 'Sin token: /me rechaza', 'GET /api/auth/me sin encabezado', { status: 401, mensaje: 'No autorizado, falta el token' },
    async (ctx) => { const r = await ctx.api('GET', '/api/auth/me'); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-21', 'TE', 'RN: las rutas privadas exigen un token válido', 'Token basura', 'Authorization: Bearer abc.def.ghi', { status: 401, mensaje: 'Token inválido o expirado' },
    async (ctx) => { const r = await ctx.api('GET', '/api/auth/me', { token: 'abc.def.ghi' }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-22', 'TE', 'RN: el token debe pertenecer a un usuario existente', 'Token válido de un usuario que ya no existe', 'token firmado con id inexistente', { status: 401, mensaje: 'Usuario no encontrado' },
    async (ctx) => { const t = jwt.sign({ id: 'a'.repeat(24) }, ctx.SECRET); const r = await ctx.api('GET', '/api/auth/me', { token: t }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-23', 'TE', 'RN: solo se aceptan tokens firmados por el servidor', 'Token firmado con otra clave (falsificado)', 'jwt firmado con clave ajena', { status: 401, mensaje: 'Token inválido o expirado' },
    async (ctx) => { const u = await ctx.usuario(); const t = jwt.sign({ id: u.id }, 'clave-del-atacante'); const r = await ctx.api('GET', '/api/auth/me', { token: t }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-24', 'TE', 'RN: el token expira', 'Token expirado', 'jwt con expiración en el pasado', { status: 401, mensaje: 'Token inválido o expirado' },
    async (ctx) => { const u = await ctx.usuario(); const t = jwt.sign({ id: u.id }, ctx.SECRET, { expiresIn: -10 }); const r = await ctx.api('GET', '/api/auth/me', { token: t }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-25', 'EP', 'RN: el esquema del encabezado debe ser Bearer', 'Encabezado sin la palabra Bearer', 'Authorization: <token>', { status: 401, mensaje: 'No autorizado, falta el token' },
    async (ctx) => { const u = await ctx.usuario(); const r = await ctx.api('GET', '/api/auth/me', { headers: { Authorization: u.token } }); return { status: r.status, mensaje: r.body.message }; }),
  caso('CN-AUTH-26', 'TE', 'RN: con sesión válida se ve el perfil sin datos secretos', 'Token válido: /me devuelve el perfil y nunca la contraseña', 'Bearer <token válido>', { status: 200, tienePerfil: true, sinPassword: true },
    async (ctx) => { const u = await ctx.usuario(); const r = await ctx.api('GET', '/api/auth/me', { token: u.token }); return { status: r.status, tienePerfil: r.body.user?.id === u.id, sinPassword: !JSON.stringify(r.body).includes('password') }; }),

  caso('CN-AUTH-27', 'EP', 'RN (seguridad): el login no acepta operadores de base de datos en lugar de texto', 'Intento de inyección tipo NoSQL: email {"$gt":""} y password {"$gt":""}', 'email y password como objetos', { status: 400 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } })).status })),
  caso('CN-AUTH-28', 'EP', 'RN: un dato de tipo equivocado es error del cliente (4xx), nunca un error del servidor', 'Login con correo válido pero contraseña que no es texto (objeto, número, lista)', 'password = {"a":1} | 123456 | ["x"]', { statuses: [400, 400, 400] },
    async (ctx) => { const a = await registrar(ctx); const s = []; for (const password of [{ a: 1 }, 123456, ['x']]) s.push((await ctx.api('POST', '/api/auth/login', { body: { email: a.body.user.email, password } })).status); return { statuses: s }; }),
  caso('CN-AUTH-29', 'TE', 'RN (seguridad): un token sin firma (alg "none") no se acepta', 'Token falsificado con algoritmo none', 'jwt con header {"alg":"none"} y el id de un usuario real', { status: 401 },
    async (ctx) => { const u = await ctx.usuario(); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: u.id })}.`; return { status: (await ctx.api('GET', '/api/auth/me', { token: t })).status }; }),

  // ── Billetera: recarga (valores límite 100 – 100,000) ──
  wallet('CN-WAL-01', 'VL', 'RN: recarga entre 100 y 100,000 fichas', 'Recarga de 99 (justo debajo del mínimo)', 'amount=99', { status: 400, saldoCambia: false },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const r = await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: 99 } }); return { status: r.status, saldoCambia: ctx.saldo(u.id) !== 0 }; }),
  wallet('CN-WAL-02', 'VL', 'RN: recarga entre 100 y 100,000 fichas', 'Recarga de 100 (mínimo exacto)', 'amount=100', { status: 200, saldo: 100 },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const r = await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: 100 } }); return { status: r.status, saldo: r.body.user?.balance }; }),
  wallet('CN-WAL-03', 'VL', 'RN: recarga entre 100 y 100,000 fichas', 'Recarga de 100,000 (máximo exacto)', 'amount=100000', { status: 200, saldo: 100000 },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const r = await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: 100000 } }); return { status: r.status, saldo: r.body.user?.balance }; }),
  wallet('CN-WAL-04', 'VL', 'RN: recarga entre 100 y 100,000 fichas', 'Recarga de 100,001 (justo encima del máximo)', 'amount=100001', { status: 400, saldoCambia: false },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const r = await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: 100001 } }); return { status: r.status, saldoCambia: ctx.saldo(u.id) !== 0 }; }),
  wallet('CN-WAL-05', 'EP', 'RN: el monto debe ser un entero positivo', 'Montos inválidos: decimal, texto, negativo, cero, vacío', 'amount = 100.5 | "abc" | -500 | 0 | null', { statuses: [400, 400, 400, 400, 400], saldoCambia: false },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const statuses = []; for (const amount of [100.5, 'abc', -500, 0, null]) statuses.push((await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount } })).status); return { statuses, saldoCambia: ctx.saldo(u.id) !== 0 }; }),
  wallet('CN-WAL-06', 'EP', 'RN: el monto puede llegar como texto numérico', 'Monto "250" (texto numérico, clase válida)', 'amount="250"', { status: 200, saldo: 250 },
    async (ctx) => { const u = await ctx.usuario({ balance: 0 }); const r = await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: '250' } }); return { status: r.status, saldo: r.body.user?.balance }; }),
  wallet('CN-WAL-07', 'TE', 'RN: recargar exige sesión', 'Recarga sin token', 'POST sin Authorization', { status: 401 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/wallet/recharge', { body: { amount: 500 } })).status })),
  wallet('CN-WAL-08', 'ES', 'RN: el saldo es la suma exacta de las recargas', 'Tres recargas seguidas suman exactamente', '+100, +200, +300 sobre saldo 1,000', { saldo: 1600 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); for (const a of [100, 200, 300]) await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: a } }); return { saldo: ctx.saldo(u.id) }; }),
  wallet('CN-WAL-09', 'ES', 'RN: toda operación queda en el historial con el saldo resultante', 'El historial registra la recarga con su saldo posterior', 'recarga 500 sobre 1,000', { tipo: 'recharge', monto: 500, saldoDespues: 1500 },
    async (ctx) => { const u = await ctx.usuario({ balance: 1000 }); await ctx.api('POST', '/api/wallet/recharge', { token: u.token, body: { amount: 500 } }); const h = await ctx.api('GET', '/api/wallet/transactions', { token: u.token }); const t = h.body.transactions[0]; return { tipo: t.type, monto: t.amount, saldoDespues: t.balanceAfter }; }),
  wallet('CN-WAL-10', 'TE', 'RN: el historial es privado de cada usuario', 'Un usuario no ve las transacciones de otro', 'usuario B consulta su historial', { cantidad: 0 },
    async (ctx) => { const a = await ctx.usuario({ balance: 0 }); const b = await ctx.usuario({ balance: 0 }); await ctx.api('POST', '/api/wallet/recharge', { token: a.token, body: { amount: 500 } }); const h = await ctx.api('GET', '/api/wallet/transactions', { token: b.token }); return { cantidad: h.body.transactions.length }; }),

  // ── Robustez general de la API ──
  gen('CN-GEN-01', 'EP', 'RN: rutas desconocidas responden JSON 404', 'Ruta inexistente', 'GET /api/no-existe', { status: 404, esJson: true },
    async (ctx) => { const r = await ctx.api('GET', '/api/no-existe'); return { status: r.status, esJson: typeof r.body?.message === 'string' }; }),
  gen('CN-GEN-02', 'EP', 'RN: un JSON mal formado no tumba el servidor', 'Cuerpo con JSON roto', 'POST register con "{usuario:"', { status: 400, sigueVivo: 200 },
    async (ctx) => { const r = await ctx.api('POST', '/api/auth/register', { raw: '{usuario:', headers: { 'Content-Type': 'application/json' } }); const h = await ctx.api('GET', '/api/health'); return { status: r.status, sigueVivo: h.status }; }),
  gen('CN-GEN-03', 'VL', 'RN: el cuerpo de una petición no puede pasar de 10 KB', 'Cuerpo de 20 KB (por encima del límite)', 'JSON de 20,000 caracteres', { status: 413 },
    async (ctx) => ({ status: (await ctx.api('POST', '/api/auth/register', { body: { username: 'x'.repeat(20000) } })).status })),
  gen('CN-GEN-04', 'TD', 'RN: solo el frontend autorizado puede llamar a la API desde un navegador (CORS)', 'Origen permitido vs origen desconocido', 'Origin: http://localhost:5173 y http://sitio-malo.com', { permitido: 'http://localhost:5173', desconocido: null },
    async (ctx) => { const a = await ctx.api('GET', '/api/health', { headers: { Origin: 'http://localhost:5173' } }); const b = await ctx.api('GET', '/api/health', { headers: { Origin: 'http://sitio-malo.com' } }); return { permitido: a.headers.get('access-control-allow-origin'), desconocido: b.headers.get('access-control-allow-origin') }; }),
  gen('CN-GEN-05', 'EP', 'RN: la API no revela la tecnología del servidor', 'Encabezados de seguridad (helmet)', 'GET /api/health', { xPoweredBy: null, nosniff: 'nosniff' },
    async (ctx) => { const r = await ctx.api('GET', '/api/health'); return { xPoweredBy: r.headers.get('x-powered-by'), nosniff: r.headers.get('x-content-type-options') }; }),
];

module.exports = { nombre: 'api-auth', setup: crearEntorno, teardown: (ctx) => ctx.cerrar(), casos };
