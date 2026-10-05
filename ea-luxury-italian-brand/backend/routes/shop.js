// Public storefront API.
const store = require('../lib/store');
const validate = require('../lib/validate');

module.exports = {
  'GET /api/products': () => store.read('products'),

  'GET /api/brands': () => [...new Set(store.read('products').map(p => p.brand))],

  'POST /api/newsletter': ({ body }) => {
    validate.email(body.email);
    return { ok: true, message: 'Welcome to EA Luxury.' };
  },

  'POST /api/contact': () => ({ ok: true, message: 'Your message has been received.' }),
};
