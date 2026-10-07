const { HttpError } = require('./http');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, label, { required = false, max = 120 } = {}) {
  const v = value == null ? '' : String(value).trim();
  if (required && !v) throw new HttpError(400, `${label} is required.`);
  if (v.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return v;
}

function email(value, { required = true } = {}) {
  const v = text(value, 'Email', { required, max: 254 }).toLowerCase();
  if (v && !EMAIL.test(v)) throw new HttpError(400, 'Please enter a valid email.');
  return v;
}

// Digits with the usual separators (+, spaces, brackets, dots, slashes, dashes) and at least 6 digits.
function phone(value) {
  const v = text(value, 'Phone', { required: true, max: 30 });
  if (!/^[+0-9 ()./-]+$/.test(v) || v.replace(/\D/g, '').length < 6) throw new HttpError(400, 'Please enter a valid phone number.');
  return v;
}

// A sign-in name: 3–30 letters, numbers, dots, dashes or underscores (never an @, so it can't be mistaken for an email).
function username(value) {
  const v = text(value, 'Username', { required: true, max: 30 });
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(v)) throw new HttpError(400, 'Usernames are 3–30 letters, numbers, dots, dashes or underscores.');
  return v;
}

// Runs a field's check and tags its error with the field's name, so the form can show the message next to it.
function field(name, check) {
  try {
    return check();
  } catch (err) {
    if (err instanceof HttpError) err.field = name;
    throw err;
  }
}

function number(value, label, { min = 0, max = Infinity, integer = false } = {}) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n)) throw new HttpError(400, `${label} must be a number.`);
  if (integer && !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number.`);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
}

function oneOf(value, label, options, fallback) {
  if (value == null || value === '') return fallback;
  if (!options.includes(value)) throw new HttpError(400, `${label} must be one of: ${options.join(', ')}.`);
  return value;
}

module.exports = { text, email, phone, username, field, number, oneOf };
