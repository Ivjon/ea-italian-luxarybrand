// CRM sign-in. The main admin account is always a Super Admin; its password comes from ADMIN_PASSWORD, or from
// backend/data/admin.json, which is created with a random password on first start (printed once in the terminal).
// The other CRM users (backend/data/users.json, managed by Super Admins) sign in with their email and the password
// a Super Admin set for them. Passwords are scrypt-hashed; sessions are in memory (sign in again after a restart).
// A session only holds the user's id: the role is looked up on every request, so a changed role or a removed user
// takes effect straight away.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { HttpError } = require('./http');
const store = require('./store');

const ACCOUNT_FILE = path.join(DATA_DIR, 'admin.json');
const COOKIE = 'ea_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 8; // failed sign-ins per address…
const FAIL_WINDOW_MS = 15 * 60 * 1000; // …within 15 minutes, before sign-in is paused for that address

const OWNER = 'owner'; // session id of the main admin account
const MIN_PASSWORD = 10;

const sessions = new Map(); // token -> { id, expires }

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });

// The account, or null when none exists yet. ADMIN_USER / ADMIN_PASSWORD override the file.
function loadAccount() {
  if (process.env.ADMIN_PASSWORD) return { username: process.env.ADMIN_USER || 'admin', ...hashPassword(process.env.ADMIN_PASSWORD) };
  try {
    const a = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
    return a && a.username && a.salt && a.hash ? a : null;
  } catch {
    return null;
  }
}
let account = loadAccount();

function saveAccount(username, password) {
  account = { username, ...hashPassword(password) };
  if (!process.env.ADMIN_PASSWORD) fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2) + '\n', { mode: 0o600 });
}

// Called at startup: creates the account on first run and returns the generated password to print, else null.
function ensureAccount() {
  if (account) return null;
  const password = crypto.randomBytes(9).toString('base64url');
  saveAccount(process.env.ADMIN_USER || 'admin', password);
  return { username: account.username, password };
}

const checkPassword = password => passwordMatches(password, account);

// CRM users from users.json (an empty list when the file does not exist yet).
function readUsers() {
  try {
    return store.read('users');
  } catch {
    return [];
  }
}
const writeUsers = users => store.write('users', users);
const userFor = id => (id === OWNER ? account && { id: OWNER, name: account.username, role: 'superadmin', main: true } : readUsers().find(u => u.id === id) || null);
// What the CRM may see of a user (never the password hash).
const publicUser = u => ({ id: u.id, name: u.name, email: u.email || '', role: u.role, ...(u.main ? { main: true } : { canSignIn: !!u.hash }) });

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
const adminAttempts = attemptLimiter();

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

function login(ctx) {
  adminAttempts.check(ctx.req);

  // The main admin signs in with its username, every other user with their email.
  const name = String(ctx.body.username || '').trim().toLowerCase();
  const { password } = ctx.body;
  let id = null;
  if (account && name === account.username.toLowerCase()) {
    if (checkPassword(password)) id = OWNER;
  } else {
    const user = readUsers().find(u => u.email === name && u.hash);
    if (user && passwordMatches(password, user)) id = user.id;
  }
  if (!id) {
    adminAttempts.fail(ctx.req);
    throw new HttpError(401, 'The username or password is not correct.');
  }
  adminAttempts.clear(ctx.req);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id, expires: Date.now() + SESSION_MS });
  ctx.headers = { 'Set-Cookie': cookieHeader(ctx.req, token, SESSION_MS / 1000) };
  return { ok: true, user: publicUser(userFor(id)) };
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
  if (user.id === OWNER) {
    if (process.env.ADMIN_PASSWORD) throw new HttpError(400, 'The password is set by ADMIN_PASSWORD on the server; change it there.');
    if (!checkPassword(current)) throw new HttpError(400, 'The current password is not correct.');
    saveAccount(account.username, newPassword(next));
  } else {
    if (!passwordMatches(current, user)) throw new HttpError(400, 'The current password is not correct.');
    const pw = newPassword(next);
    const users = readUsers();
    Object.assign(users.find(u => u.id === user.id), hashPassword(pw));
    writeUsers(users);
  }
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
  readUsers,
  writeUsers,
  publicUser,
  userFor,
  newPassword,
  endSessions,
  OWNER,
  sessionToken: req => cookies(req)[COOKIE],
  routes: {
    'POST /api/auth/login': login,
    'POST /api/auth/logout': logout,
    'GET /api/auth/me': me,
    'POST /api/auth/password': changePassword,
  },
};
