// Customer accounts for the store: create an account or sign in with email + password, then see your orders and
// their status. Each account is linked to (or creates) the matching CRM customer. Passwords are scrypt-hashed in
// backend/data/accounts.json; sign-ins last 30 days and survive restarts (only a hash of each token is stored, in
// backend/data/account-sessions.json). Both files are kept out of git.
const crypto = require('crypto');
const store = require('./store');
const validate = require('./validate');
const { HttpError } = require('./http');
const { hashPassword, passwordMatches, cookies, setCookie, attemptLimiter } = require('./auth');

const COOKIE = 'ea_customer';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const attempts = attemptLimiter();

const readList = name => { try { return store.read(name); } catch { return []; } };
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const publicAccount = a => ({ name: a.name, email: a.email });

// The signed-in customer's account for this request, or null.
function sessionAccount(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const session = readList('account-sessions').find(s => s.token === tokenHash(token));
  if (!session || session.expires < Date.now()) return null;
  return readList('accounts').find(a => a.email === session.email) || null;
}

function requireCustomer(req) {
  const account = sessionAccount(req);
  if (!account) throw new HttpError(401, 'Please sign in to see your account.');
  return account;
}

function startSession(ctx, account) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const sessions = readList('account-sessions').filter(s => s.expires > now); // expired ones are dropped here
  sessions.push({ token: tokenHash(token), email: account.email, expires: now + SESSION_MS });
  store.write('account-sessions', sessions);
  ctx.headers = { 'Set-Cookie': setCookie(ctx.req, COOKIE, token, SESSION_MS / 1000) };
  return { ok: true, account: publicAccount(account) };
}

function signup(ctx) {
  const name = validate.text(ctx.body.name, 'Name', { required: true, max: 120 });
  const email = validate.email(ctx.body.email);
  const password = String(ctx.body.password || '');
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Choose a password of at least ${MIN_PASSWORD} characters.`);
  const accounts = readList('accounts');
  if (accounts.some(a => a.email === email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');

  // The account belongs to the CRM customer with this email; a new customer is added when there is none.
  const customers = store.read('customers');
  let customer = customers.find(c => c.email.toLowerCase() === email);
  if (!customer) {
    customer = { id: store.nextId(customers, 'C', 1001), name, email, city: '', orders: 0, spent: 0, status: 'New' };
    customers.push(customer);
    store.write('customers', customers);
  }
  const account = { email, name, customerId: customer.id, ...hashPassword(password), created: new Date().toISOString() };
  accounts.push(account);
  store.write('accounts', accounts);
  ctx.status = 201;
  return startSession(ctx, account);
}

function login(ctx) {
  attempts.check(ctx.req);
  const email = String(ctx.body.email || '').trim().toLowerCase();
  const account = readList('accounts').find(a => a.email === email);
  if (!account || !passwordMatches(ctx.body.password, account)) {
    attempts.fail(ctx.req);
    throw new HttpError(401, 'The email or password is not correct.');
  }
  attempts.clear(ctx.req);
  return startSession(ctx, account);
}

function logout(ctx) {
  const token = cookies(ctx.req)[COOKIE];
  if (token) store.write('account-sessions', readList('account-sessions').filter(s => s.token !== tokenHash(token)));
  ctx.headers = { 'Set-Cookie': setCookie(ctx.req, COOKIE, '', 0) };
  return { ok: true };
}

const me = ctx => ({ account: publicAccount(requireCustomer(ctx.req)) });

// The customer's orders, newest first: those placed while signed in or with the account's email, and orders the
// store entered in the CRM for the linked customer.
function myOrders(ctx) {
  const account = requireCustomer(ctx.req);
  const customer = store.read('customers').find(c => c.id === account.customerId);
  return store.read('orders')
    .filter(o => o.account === account.email || (o.email || '').toLowerCase() === account.email || (customer && o.customerId === customer.id))
    .map(({ id, date, status, items, total, subtotal, shipping, delivery, payment, lines, address }) => ({ id, date, status, items, total, subtotal, shipping, delivery, payment, lines, address }));
}

module.exports = {
  sessionAccount,
  routes: {
    'POST /api/account/signup': signup,
    'POST /api/account/login': login,
    'POST /api/account/logout': logout,
    'GET /api/account/me': me,
    'GET /api/account/orders': myOrders,
  },
};
