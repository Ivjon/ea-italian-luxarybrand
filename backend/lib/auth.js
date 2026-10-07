// CRM sessions. CRM users are the superadmin and admin rows of backend/data/users.json (see users.js). The main admin
// (always a Super Admin) is created with a random password on first start (printed once in the terminal), or takes
// its password from ADMIN_PASSWORD. There is no separate CRM sign-in: staff use the store's sign-in form with their
// username or email and the password a Super Admin set for them (accounts.js), which starts a session here.
// Passwords are scrypt-hashed; sessions are in memory (sign in again after a restart). A session only holds the
// user's id: the role is looked up on every request, so a changed role or a removed user takes effect straight away.
const crypto = require('crypto');
const { HttpError } = require('./http');
const users = require('./users');

const COOKIE = 'ea_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 8; // failed sign-ins per address…
const FAIL_WINDOW_MS = 15 * 60 * 1000; // …within 15 minutes, before sign-in is paused for that address

const MIN_PASSWORD = 10;

const sessions = new Map(); // token -> { id, expires }

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });

// Called at startup: makes sure the main admin exists. On the first run it is created with a random password, which
// is returned to print once (else null). With ADMIN_PASSWORD (and optionally ADMIN_USER) set, those are applied to it.
function ensureAccount() {
  const { ADMIN_USER, ADMIN_PASSWORD } = process.env;
  const rows = users.read();
  let main = rows.find(u => u.main);
  if (main && (!ADMIN_PASSWORD || (passwordMatches(ADMIN_PASSWORD, main) && (!ADMIN_USER || main.username === ADMIN_USER)))) return null;
  const username = ADMIN_USER || (main && main.username) || 'admin';
  const password = ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  if (!main) {
    main = { id: users.nextId(rows), role: 'superadmin', name: username, main: true, created: new Date().toISOString() };
    rows.push(main);
  }
  Object.assign(main, { username, ...hashPassword(password) });
  users.write(rows);
  return ADMIN_PASSWORD ? null : { username, password };
}

// The CRM user with this id (a superadmin or admin row), or null.
const userFor = id => users.read().find(u => u.id === id && users.isStaff(u)) || null;
// What the CRM may see of a user (never the password hash).
const publicUser = u => ({ id: u.id, name: u.name, email: u.email || '', username: u.username || '', role: u.role, ...(u.main ? { main: true } : { canSignIn: !!u.hash }) });

// Signs out every session of a user, except `keep` (the token of the request making the change).
function endSessions(id, keep) {
  for (const [token, s] of sessions) if (s.id === id && token !== keep) sessions.delete(token);
}

const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(([k, v]) => k && v));
const ipOf = req => req.socket.remoteAddress || 'unknown';
const secure = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
const setCookie = (req, name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
const cookieHeader = (req, value, maxAge) => setCookie(req, COOKIE, value, maxAge).replace('SameSite=Lax', 'SameSite=Strict');
// Same password check for any account: scrypt with the stored salt, compared in constant time.
const passwordMatches = (password, { salt, hash }) => crypto.timingSafeEqual(Buffer.from(hashPassword(String(password || ''), salt).hash, 'hex'), Buffer.from(hash, 'hex'));
// Sign-in attempt limit per address: too many failures in a window pauses sign-in for that address.
function attemptLimiter(max = MAX_FAILS, windowMs = FAIL_WINDOW_MS) {
  const seen = new Map();
  const entry = req => { const ip = ipOf(req), e = seen.get(ip); if (e && Date.now() - e.first > windowMs) seen.delete(ip); return ip; };
  return {
    check(req) { if ((seen.get(entry(req))?.count || 0) >= max) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.'); },
    fail(req) { const ip = entry(req), e = seen.get(ip) || { count: 0, first: Date.now() }; e.count += 1; seen.set(ip, e); },
    clear(req) { seen.delete(ipOf(req)); },
  };
}

// The signed-in CRM user for this request ({ id, name, email, role }), or null.
function sessionUser(req) {
  const token = cookies(req)[COOKIE];
  const session = token && sessions.get(token);
  if (!session) return null;
  const user = session.expires >= Date.now() && userFor(session.id);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return user;
}

function requireAdmin(req) {
  const user = sessionUser(req);
  if (!user) throw new HttpError(401, 'Please sign in to use the CRM.');
  return user;
}

// Starts a CRM session for a staff user whose password was just checked (by the store's sign-in, see accounts.js).
function startSession(ctx, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: user.id, expires: Date.now() + SESSION_MS });
  ctx.headers = { 'Set-Cookie': cookieHeader(ctx.req, token, SESSION_MS / 1000) };
}

function logout(ctx) {
  const token = cookies(ctx.req)[COOKIE];
  if (token) sessions.delete(token);
  ctx.headers = { 'Set-Cookie': cookieHeader(ctx.req, '', 0) };
  return { ok: true };
}

function me(ctx) {
  const user = sessionUser(ctx.req);
  if (!user) throw new HttpError(401, 'Not signed in.');
  return publicUser(user);
}

// A new password's length check, shared with the user form in the CRM.
function newPassword(value) {
  const pw = String(value || '');
  if (pw.length < MIN_PASSWORD) throw new HttpError(400, `Choose a password of at least ${MIN_PASSWORD} characters.`);
  return pw;
}

// Change your own password (signed in, with the current one). Your other sessions are signed out.
function changePassword(ctx) {
  const user = requireAdmin(ctx.req);
  const { current, next } = ctx.body;
  if (user.main && process.env.ADMIN_PASSWORD) throw new HttpError(400, 'The password is set by ADMIN_PASSWORD on the server; change it there.');
  if (!passwordMatches(current, user)) throw new HttpError(400, 'The current password is not correct.');
  const pw = newPassword(next);
  const rows = users.read();
  Object.assign(rows.find(u => u.id === user.id), hashPassword(pw));
  users.write(rows);
  endSessions(user.id, cookies(ctx.req)[COOKIE]);
  return { ok: true };
}

module.exports = {
  hashPassword,
  passwordMatches,
  cookies,
  setCookie,
  attemptLimiter,
  ensureAccount,
  sessionUser,
  requireAdmin,
  startSession,
  publicUser,
  userFor,
  newPassword,
  endSessions,
  sessionToken: req => cookies(req)[COOKIE],
  routes: {
    'POST /api/auth/logout': logout,
    'GET /api/auth/me': me,
    'POST /api/auth/password': changePassword,
  },
};
