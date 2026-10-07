// Public storefront API.
const store = require('../lib/store');
const validate = require('../lib/validate');

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
