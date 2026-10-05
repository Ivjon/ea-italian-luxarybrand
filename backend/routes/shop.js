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
