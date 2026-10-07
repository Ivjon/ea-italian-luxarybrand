// Public storefront API.
const store = require('../lib/store');
const validate = require('../lib/validate');
const { attemptLimiter } = require('../lib/auth');
const { HttpError } = require('../lib/http');

// Track an order without signing in: wrong guesses are limited per address, like sign-in.
const trackAttempts = attemptLimiter(20);
// Names compare without case, accents or extra spaces ("Chiara  Rossi" = "chiara rossi" = "Chiára Rossi").
const plainName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// "EA10284", "ea 10284", "#EA10284" and "10284" are the same order number.
const orderNumber = s => { const v = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^\d+$/.test(v) ? `EA${v}` : v; };

function trackOrder({ req, body }) {
  trackAttempts.check(req);
  const firstName = validate.field('firstName', () => validate.text(body.firstName, 'First name', { required: true, max: 60 }));
  const lastName = validate.field('lastName', () => validate.text(body.lastName, 'Last name', { required: true, max: 60 }));
  const id = orderNumber(validate.field('orderId', () => validate.text(body.orderId, 'Order number', { required: true, max: 30 })));
  const order = store.read('orders').find(o => o.id === id && plainName(o.customer) === plainName(`${firstName} ${lastName}`));
  if (!order) {
    trackAttempts.fail(req);
    throw new HttpError(404, 'We could not find an order with these details. Check the order number and use the first and last name given at checkout.');
  }
  // Only what the tracker shows: no address, email, phone or payment details.
  const { date, status, items, lines } = order;
  return { id: order.id, date, status, items, lines: (lines || []).map(({ brand, name, image, color, size, qty }) => ({ brand, name, image, color, size, qty })) };
}

module.exports = {
  // Products hidden in the CRM (drafts, pieces taken off sale) are not part of the store.
  'GET /api/products': () => store.read('products').filter(p => !p.hidden),

  'GET /api/brands': () => [...new Set(store.read('products').filter(p => !p.hidden).map(p => p.brand))],

  // Newsletter sign-up (full name, email, phone): saved as a CRM lead with source "Newsletter"; signing up again with
  // the same email updates that lead instead of adding another.
  'POST /api/newsletter': ({ body }) => {
    const name = validate.field('name', () => validate.text(body.name, 'Full name', { required: true, max: 120 }));
    const email = validate.field('email', () => validate.email(body.email));
    const phone = validate.field('phone', () => validate.phone(body.phone));
    const leads = store.read('leads');
    const lead = leads.find(l => l.source === 'Newsletter' && String(l.email || '').toLowerCase() === email);
    if (lead) Object.assign(lead, { name, phone });
    else leads.push({ id: store.nextId(leads, 'L', 1), name, email, phone, source: 'Newsletter', stage: 'New' });
    store.write('leads', leads);
    return { ok: true, message: lead ? 'You are already on our list; your details are updated.' : 'Welcome to EA Luxury. You will hear from us soon.' };
  },

  'POST /api/track-order': trackOrder,

  'POST /api/contact': () => ({ ok: true, message: 'Your message has been received.' }),

  // "Find a store" on a product page: saved as a CRM lead so the team can follow up.
  'POST /api/store-request': ({ body }) => {
    const name = validate.text(body.name, 'Name', { required: true });
    const email = validate.email(body.email);
    const product = store.read('products').find(p => p.id === body.productId);
    const leads = store.read('leads');
    const source = `Store request: ${product ? product.name : 'website'}`.slice(0, 60);
    leads.push({ id: store.nextId(leads, 'L', 1), name, email, source, stage: 'New' });
    store.write('leads', leads);
    return { ok: true, message: 'Thank you. A client advisor will contact you to arrange your visit.' };
  },
};
