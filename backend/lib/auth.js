// Admin sign-in for the CRM: one admin account, a scrypt-hashed password and in-memory sessions (signing in again
// after a server restart is expected). The password comes from ADMIN_PASSWORD, or from backend/data/admin.json,
// which is created with a random password on first start (printed once in the terminal).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { HttpError } = require('./http');

const ACCOUNT_FILE = path.join(DATA_DIR, 'admin.json');
const COOKIE = 'ea_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 8; // failed sign-ins per address…
const FAIL_WINDOW_MS = 15 * 60 * 1000; // …within 15 minutes, before sign-in is paused for that address

const sessions = new Map(); // token -> { username, expires }

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

// The signed-in admin's username for this request, or null.
function sessionUser(req) {
  const token = cookies(req)[COOKIE];
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.username;
}

function requireAdmin(req) {
  if (!sessionUser(req)) throw new HttpError(401, 'Please sign in to use the CRM.');
}

function login(ctx) {
  adminAttempts.check(ctx.req);

  const { username, password } = ctx.body;
  const ok = account && String(username || '').trim().toLowerCase() === account.username.toLowerCase() && checkPassword(password);
  if (!ok) {
    adminAttempts.fail(ctx.req);
    throw new HttpError(401, 'The username or password is not correct.');
  }
  adminAttempts.clear(ctx.req);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: account.username, expires: Date.now() + SESSION_MS });
  ctx.headers = { 'Set-Cookie': cookieHeader(ctx.req, token, SESSION_MS / 1000) };
  return { ok: true, username: account.username };
}

function logout(ctx) {
  const token = cookies(ctx.req)[COOKIE];
  if (token) sessions.delete(token);
  ctx.headers = { 'Set-Cookie': cookieHeader(ctx.req, '', 0) };
  return { ok: true };
}

function me(ctx) {
  const username = sessionUser(ctx.req);
  if (!username) throw new HttpError(401, 'Not signed in.');
  return { username };
}

// Change the password (signed in, with the current one). Other sessions are signed out.
function changePassword(ctx) {
  requireAdmin(ctx.req);
  if (process.env.ADMIN_PASSWORD) throw new HttpError(400, 'The password is set by ADMIN_PASSWORD on the server; change it there.');
  const { current, next } = ctx.body;
  if (!checkPassword(current)) throw new HttpError(400, 'The current password is not correct.');
  const pw = String(next || '');
  if (pw.length < 10) throw new HttpError(400, 'Choose a new password of at least 10 characters.');
  saveAccount(account.username, pw);
  const mine = cookies(ctx.req)[COOKIE];
  for (const token of sessions.keys()) if (token !== mine) sessions.delete(token);
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
  routes: {
    'POST /api/auth/login': login,
    'POST /api/auth/logout': logout,
    'GET /api/auth/me': me,
    'POST /api/auth/password': changePassword,
  },
};
