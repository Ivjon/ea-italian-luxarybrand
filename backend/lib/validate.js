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

module.exports = { text, email, number, oneOf };
