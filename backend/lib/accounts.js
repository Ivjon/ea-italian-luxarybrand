// The store's sign-in, the only one there is: everyone signs in here with their username or email and password.
// Customers stay on the store and see My account (their orders and their status); CRM staff (superadmin / admin)
// get a CRM session instead (auth.js) and are sent on to the CRM. Customers create an account here; each account is
// linked to (or creates) the matching CRM customer. Accounts are the rows of backend/data/users.json (see users.js),
// passwords scrypt-hashed. Customer sign-ins last 30 days and survive restarts (only a hash of each token is stored,
// with the user's id, in backend/data/account-sessions.json). Both files are kept out of git.
const crypto = require('crypto');
const store = require('./store');
const users = require('./users');
const validate = require('./validate');
const { tr, trParts } = require('./i18n');
const { HttpError } = require('./http');
const auth = require('./auth');
const { hashPassword, passwordMatches, cookies, setCookie, attemptLimiter } = auth;

const COOKIE = 'ea_customer';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const attempts = attemptLimiter();

const readList = name => { try { return store.read(name); } catch { return []; } };
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const publicAccount = a => ({ name: a.name, email: a.email, username: a.username || '', phone: a.phone || '' });

// The signed-in customer's account for this request, or null.
function sessionAccount(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const session = readList('account-sessions').find(s => s.token === tokenHash(token));
  if (!session || session.expires < Date.now()) return null;
  return users.read().find(u => u.id === session.userId && users.isCustomer(u)) || null;
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
  sessions.push({ token: tokenHash(token), userId: account.id, expires: now + SESSION_MS });
  store.write('account-sessions', sessions);
  ctx.headers = { 'Set-Cookie': setCookie(ctx.req, COOKIE, token, SESSION_MS / 1000) };
  return { ok: true, account: publicAccount(account) };
}

const { field } = validate;


// Every field is required, in the order of the form: full name, email, phone, username, password (twice), terms.
function signup(ctx) {
  const b = ctx.body;
  const name = field('name', () => validate.text(b.name, 'Full name', { required: true, max: 120 }));
  const email = field('email', () => validate.email(b.email));
  const phone = field('phone', () => validate.phone(b.phone));
  const username = field('username', () => validate.username(b.username));
  const password = String(b.password || '');
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Choose a password of at least ${MIN_PASSWORD} characters.`, 'password');
  if (String(b.passwordConfirm || '') !== password) throw new HttpError(400, 'The two passwords are not the same.', 'passwordConfirm');
  if (b.terms !== true && b.terms !== 'on') throw new HttpError(400, 'Please accept the terms and conditions.', 'terms');
  const rows = users.read();
  if (users.emailTaken(rows, email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'email');
  if (users.usernameTaken(rows, username)) throw new HttpError(409, 'This username is taken. Please choose another one.', 'username');

  // The account belongs to the CRM customer with this email; a new customer is added when there is none.
  const customers = store.read('customers');
  let customer = customers.find(c => c.email.toLowerCase() === email);
  if (!customer) {
    customer = { id: store.nextId(customers, 'C', 1001), name, email, phone, city: '', orders: 0, spent: 0, status: 'New' };
    customers.push(customer);
    store.write('customers', customers);
  } else if (!customer.phone) {
    customer.phone = phone;
    store.write('customers', customers);
  }
  const now = new Date().toISOString();
  const account = { id: users.nextId(rows), role: 'customer', name, email, phone, username, customerId: customer.id, ...hashPassword(password), termsAccepted: now, created: now };
  rows.push(account);
  users.write(rows);
  ctx.status = 201;
  return startSession(ctx, account);
}

// Username or email (`login`) and password, for every role.
function login(ctx) {
  attempts.check(ctx.req);
  const user = users.findLogin(users.read(), ctx.body.login);
  if (!user || !user.hash || !passwordMatches(ctx.body.password, user)) {
    attempts.fail(ctx.req);
    throw new HttpError(401, 'The username, email or password is not correct.');
  }
  attempts.clear(ctx.req);
  if (users.isStaff(user)) {
    auth.startSession(ctx, user);
    return { ok: true, redirect: '/admin/' };
  }
  return startSession(ctx, user);
}

function logout(ctx) {
  const token = cookies(ctx.req)[COOKIE];
  if (token) store.write('account-sessions', readList('account-sessions').filter(s => s.token !== tokenHash(token)));
  ctx.headers = { 'Set-Cookie': setCookie(ctx.req, COOKIE, '', 0) };
  return { ok: true };
}

// Who is signed in: a customer ({ account }), else a CRM user ({ staff }, so the store can offer the way to the CRM).
function me(ctx) {
  const account = sessionAccount(ctx.req);
  if (account) return { account: publicAccount(account) };
  const staff = auth.sessionUser(ctx.req);
  if (staff) return { account: null, staff: { name: staff.name, role: staff.role } };
  throw new HttpError(401, 'Please sign in to see your account.');
}

// The customer's orders, newest first: those placed while signed in or with the account's email, and orders the
// store entered in the CRM for the linked customer.
function ownsOrder(account) {
  const customer = store.read('customers').find(c => c.id === account.customerId);
  return o => o.account === account.email || (o.email || '').toLowerCase() === account.email || (customer && o.customerId === customer.id);
}

// An order as its customer sees it, in the page's language. `deliveryKey` is the checkout option it uses.
const publicOrder = (lang, { id, date, status, items, total, subtotal, shipping, delivery, payment, lines, address }) => ({
  id, date, status, items, total, subtotal, shipping, delivery: trParts(lang, delivery), deliveryKey: /^express/i.test(delivery || '') ? 'express' : 'standard', payment: tr(lang, payment), lines, address,
});

function myOrders(ctx) {
  const account = requireCustomer(ctx.req);
  return store.read('orders').filter(ownsOrder(account)).map(o => publicOrder(ctx.lang, o));
}

module.exports = {
  sessionAccount,
  requireCustomer,
  ownsOrder,
  publicOrder,
  routes: {
    'POST /api/account/signup': signup,
    'POST /api/account/login': login,
    'POST /api/account/logout': logout,
    'GET /api/account/me': me,
    'GET /api/account/orders': myOrders,
  },
};
