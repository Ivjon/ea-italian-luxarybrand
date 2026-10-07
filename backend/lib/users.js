// Everyone who can sign in, in one file: backend/data/users.json (kept out of git). One row per person; `role` says
// what they can do:
//   superadmin  CRM, everything. The main admin (`main: true`) is the one the server creates and ADMIN_PASSWORD sets.
//   admin       CRM, store work (Store Admin).
//   customer    the store's My account; `customerId` links the row to the CRM customer (customers.json).
// Everyone signs in on the store's one sign-in form with their username or email (see accounts.js); staff then go on
// to the CRM. Usernames never contain an @, so the two can't be confused.
// Every row has the same columns, null when unused, and the file is written grouped by role (main admin first), so it
// maps onto one database table as is:
//   users(id PK, role, name, email UNIQUE, phone, username UNIQUE (case-insensitive), main,
//         customerId FK → customers.id, salt, hash, termsAccepted, created)
// Passwords are scrypt-hashed (salt + hash, see auth.js); staff added in the CRM without a password have null ones.
// termsAccepted is when a customer accepted the terms and conditions at sign-up.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const store = require('./store');

const STAFF_ROLES = ['superadmin', 'admin'];
const ROLE_ORDER = [...STAFF_ROLES, 'customer'];
const COLUMNS = ['id', 'role', 'name', 'email', 'phone', 'username', 'main', 'customerId', 'salt', 'hash', 'termsAccepted', 'created'];

const isStaff = u => STAFF_ROLES.includes(u.role);
const isCustomer = u => u.role === 'customer';

// All rows (an empty list when the file does not exist yet).
function read() {
  try {
    return store.read('users');
  } catch {
    return [];
  }
}

const toRow = u => Object.fromEntries(COLUMNS.map(c => [c, c === 'main' ? !!u.main : u[c] ?? null]));
const rank = u => (u.main ? -1 : ROLE_ORDER.indexOf(u.role));
function write(users) {
  const rows = users.map(toRow).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  store.write('users', rows);
}

const nextId = users => store.nextId(users, 'U', 1001);
// Emails and usernames are unique across all roles (one person, one sign-in); usernames ignore case.
const sameName = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const emailTaken = (users, email, ignoreId) => users.some(u => u.email === email && u.id !== ignoreId);
const usernameTaken = (users, username, ignoreId) => users.some(u => sameName(u.username, username) && u.id !== ignoreId);
// The user who signs in with this username or email (any role), or undefined.
const findLogin = (users, login) => {
  const name = String(login || '').trim();
  return name ? users.find(u => (name.includes('@') ? u.email === name.toLowerCase() : sameName(u.username, name))) : undefined;
};

// One-time move from the old separate files into users.json: admin.json (the main admin) and accounts.json (customers).
// The old files are deleted once users.json is written, and customer sign-ins (account-sessions.json) move from email
// to id. Safe to run again: rows that are already there are not added twice.
function migrate() {
  const legacy = name => path.join(DATA_DIR, `${name}.json`);
  const old = ['admin', 'accounts'].filter(name => fs.existsSync(legacy(name)));
  if (!old.length) return;

  const users = read();
  if (old.includes('admin')) {
    const a = store.read('admin');
    if (a && a.hash && !users.some(u => u.main)) {
      users.push({ id: nextId(users), role: 'superadmin', name: a.username, username: a.username, main: true, salt: a.salt, hash: a.hash });
    }
  }
  if (old.includes('accounts')) {
    for (const a of store.read('accounts')) {
      if (users.some(u => isCustomer(u) && u.email === a.email)) continue;
      if (emailTaken(users, a.email)) console.warn(`users.json: ${a.email} is both a CRM user and a customer; both rows are kept.`);
      users.push({ id: nextId(users), role: 'customer', name: a.name, email: a.email, customerId: a.customerId, salt: a.salt, hash: a.hash, created: a.created });
    }
  }
  write(users);

  try {
    const sessions = store.read('account-sessions');
    const idOf = email => (users.find(u => isCustomer(u) && u.email === email) || {}).id;
    store.write('account-sessions', sessions.map(({ email, ...s }) => (s.userId ? s : { ...s, userId: idOf(email) })).filter(s => s.userId));
  } catch {} // no customer sign-ins yet

  for (const name of old) fs.unlinkSync(legacy(name));
  console.log(`Moved ${old.map(n => `${n}.json`).join(' and ')} into users.json.`);
}

module.exports = { STAFF_ROLES, isStaff, isCustomer, read, write, nextId, emailTaken, usernameTaken, findLogin, migrate };
