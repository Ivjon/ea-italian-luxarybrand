// CRM / admin API. Every /api/crm/* route needs a signed-in CRM user (checked in server.js, see lib/auth.js).
const store = require('../lib/store');
const auth = require('../lib/auth');
const users = require('../lib/users');
const validate = require('../lib/validate');
const { HttpError } = require('../lib/http');
const { saveUpload } = require('../lib/uploads');

const ORDER_STATUSES = ['Awaiting Payment', 'Processing', 'Shipped', 'Delivered'];
const LEAD_STAGES = ['New', 'Warm', 'Qualified', 'Won', 'Lost'];
const ROLES = users.STAFF_ROLES;
const GENDERS = ['Women', 'Men', 'Unisex', 'Kids']; // saved as the product's `category`
const SIZE_TYPES = ['clothing', 'shoes', 'kids-clothing', 'kids-shoes']; // size charts, see frontend/catalog.js
const NUMBER_SIZE_TYPES = ['shoes', 'kids-shoes']; // shoe charts take number sizes only (38, 38.5)
const MEDIA_SRC = /^\/assets\/[A-Za-z0-9._/-]+$/; // site files only (uploads or bundled product photos)
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

// Validated product fields from a CRM form. The first photo becomes `image`, the cover used on cards and in the bag.
function productFields(body) {
  const media = (Array.isArray(body.media) ? body.media : []).slice(0, 30).map(m => {
    const type = m && m.type;
    const src = String((m && m.src) || '');
    if (!['image', 'video'].includes(type) || !MEDIA_SRC.test(src) || src.includes('..')) {
      throw new HttpError(400, 'One of the photos or videos is not a valid site file.');
    }
    return { type, src };
  });
  const cover = media.find(m => m.type === 'image');
  if (!cover) throw new HttpError(400, 'Add at least one photo.');
  const lines = Array.isArray(body.details) ? body.details : String(body.details || '').split(/\r?\n/);
  // Colours the product comes in (customers pick one on the product page); the first is the main colour.
  // `color` / `colorHex` is the older single-colour form, still accepted.
  const seen = new Set();
  const colors = (Array.isArray(body.colors) ? body.colors : body.color ? [{ name: body.color, hex: body.colorHex }] : [])
    .slice(0, 30)
    .map(c => ({ name: validate.text(c && c.name, 'Colour name', { max: 60 }), hex: /^#[0-9a-f]{6}$/i.test((c && c.hex) || '') ? c.hex.toLowerCase() : '' }))
    .filter(c => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()))
    .map(c => (c.hex ? c : { name: c.name }));
  // Sizes with their own stock (clothing XS–XL, shoes 35–46, …); when present, the product's stock is their total.
  const seenSizes = new Set();
  const sizes = (Array.isArray(body.sizes) ? body.sizes : [])
    .slice(0, 40)
    .map(s => ({ size: validate.text(s && s.size, 'Size', { max: 10 }), qty: validate.number(s && s.qty, 'Size quantity', { min: 0, max: 1e5, integer: true }) }))
    .filter(s => s.size && !seenSizes.has(s.size.toLowerCase()) && seenSizes.add(s.size.toLowerCase()));
  // The CRM picks the chart from the product's type and gender.
  const sizeType = sizes.length ? validate.oneOf(body.sizeType, 'Size chart', SIZE_TYPES, 'clothing') : '';
  if (NUMBER_SIZE_TYPES.includes(sizeType) && sizes.some(s => !/^\d+([.,]\d+)?$/.test(s.size))) {
    throw new HttpError(400, 'Shoe sizes must be numbers, e.g. 38 or 38.5.');
  }
  const fields = {
    brand: validate.text(body.brand, 'Brand', { required: true, max: 60 }),
    name: validate.text(body.name, 'Name', { required: true }),
    category: validate.oneOf(body.category, 'Gender', GENDERS, 'Women'),
    type: validate.text(body.type, 'Type', { required: true, max: 40 }),
    price: validate.number(body.price, 'Price', { min: 1, max: 1e6 }),
    stock: sizes.length ? sizes.reduce((sum, s) => sum + s.qty, 0) : validate.number(body.stock, 'Stock', { min: 0, max: 1e5, integer: true }),
    sizes,
    sizeType,
    // shown with a "New arrival" label and in the home page's New Arrivals
    isNew: body.isNew === true || body.isNew === 'on' || body.isNew === 'true',
    // hidden pieces stay in the CRM but are left out of the store (drafts, pieces taken off sale)
    hidden: body.hidden === true || body.hidden === 'on' || body.hidden === 'true',
    // percent off the price; discounted pieces are found with the store's "On sale" filter
    discount: body.discount === '' || body.discount == null ? 0 : validate.number(body.discount, 'Discount', { min: 0, max: 90, integer: true }),
    image: cover.src,
    media,
    colors,
    code: validate.text(body.code, 'Product code', { max: 60 }),
    description: validate.text(body.description, 'Description', { max: 4000 }),
    composition: validate.text(body.composition, 'Composition', { max: 1000 }),
    details: lines.map(l => validate.text(l, 'Each detail line', { max: 200 })).filter(Boolean).slice(0, 30),
    // keys of the care guide in frontend/catalog.js
    care: (Array.isArray(body.care) ? body.care : []).filter(k => /^[a-z0-9-]{1,40}$/.test(k)).slice(0, 20),
    careNote: validate.text(body.careNote, 'Care notes', { max: 1000 }),
  };
  for (const key of ['colors', 'sizes', 'sizeType', 'code', 'description', 'composition', 'details', 'care', 'careNote']) {
    if (!fields[key].length) delete fields[key];
  }
  if (!fields.isNew) delete fields.isNew;
  if (!fields.hidden) delete fields.hidden;
  if (!fields.discount) delete fields.discount;
  return fields;
}

function findProduct(products, id) {
  const index = products.findIndex(p => p.id === id);
  if (index < 0) throw new HttpError(404, 'Product not found.');
  return index;
}

function createProduct({ body }) {
  const products = store.read('products');
  const product = { id: store.nextId(products, 'p', 1), ...productFields(body) };
  products.push(product); // last in the file = newest, for the "New arrivals" sort
  store.write('products', products);
  return product;
}

function updateProduct({ body }) {
  const products = store.read('products');
  const index = findProduct(products, body.id);
  products[index] = { id: products[index].id, ...productFields(body) };
  store.write('products', products);
  return products[index];
}

// Stock of a one-size piece, changed from the CRM's product list (sized pieces are edited per size in the editor).
function updateStock({ body }) {
  const products = store.read('products');
  const product = products[findProduct(products, body.id)];
  if (product.sizes && product.sizes.length) throw new HttpError(400, 'This piece has sizes: change the stock per size in the product editor.');
  product.stock = validate.number(body.stock, 'Stock', { min: 0, max: 1e5, integer: true });
  store.write('products', products);
  return product;
}

function deleteProduct({ body }) {
  const products = store.read('products');
  const [removed] = products.splice(findProduct(products, body.id), 1);
  store.write('products', products);
  return { ok: true, id: removed.id };
}

const upload = async ({ req }) => saveUpload(req);
upload.raw = true;

function createCustomer({ body }) {
  const name = validate.text(body.name, 'Name', { required: true });
  const email = validate.email(body.email);
  const city = validate.text(body.city, 'City', { max: 80 });

  const customers = store.read('customers');
  if (customers.some(c => c.email.toLowerCase() === email)) {
    throw new HttpError(409, 'A customer with this email already exists.');
  }
  const customer = { id: store.nextId(customers, 'C', 1001), name, email, city, orders: 0, spent: 0, status: 'New' };
  customers.push(customer);
  store.write('customers', customers);
  return customer;
}

function createLead({ body }) {
  const name = validate.text(body.name, 'Name', { required: true });
  const email = validate.email(body.email);
  const source = validate.text(body.source, 'Source', { max: 60 }) || 'Website';

  const leads = store.read('leads');
  const lead = { id: store.nextId(leads, 'L', 1), name, email, source, stage: 'New' };
  leads.push(lead);
  store.write('leads', leads);
  return lead;
}

function createOrder({ body }) {
  const customerId = validate.text(body.customerId, 'Customer', { required: true });
  const items = validate.number(body.items, 'Items', { min: 1, max: 99, integer: true });
  const total = validate.number(body.total, 'Total', { min: 1, max: 1e7 });
  const status = validate.oneOf(body.status, 'Status', ORDER_STATUSES, 'Processing');

  const customers = store.read('customers');
  const customer = customers.find(c => c.id === customerId);
  if (!customer) throw new HttpError(400, 'Customer not found.');

  const orders = store.read('orders');
  const order = { id: store.nextId(orders, 'EA', 10001), customer: customer.name, customerId: customer.id, email: customer.email, items, total, status, date: today() };
  orders.unshift(order); // newest first, like the existing data

  customer.orders += 1;
  customer.spent += total;
  if (customer.status === 'New') customer.status = 'Active';

  store.write('orders', orders);
  store.write('customers', customers);
  return order;
}

// Status changes from the CRM: an order moves between the board columns, a lead through its stages.
function updateOrder({ body }) {
  const orders = store.read('orders');
  const order = orders.find(o => o.id === String(body.id || ''));
  if (!order) throw new HttpError(404, 'Order not found.');
  order.status = validate.oneOf(body.status, 'Status', ORDER_STATUSES, order.status);
  store.write('orders', orders);
  return order;
}

function updateLead({ body }) {
  const leads = store.read('leads');
  const lead = leads.find(l => l.id === String(body.id || ''));
  if (!lead) throw new HttpError(404, 'Lead not found.');
  lead.stage = validate.oneOf(body.stage, 'Stage', LEAD_STAGES, lead.stage);
  store.write('leads', leads);
  return lead;
}

// CRM users (Super Admins only, see server.js): the superadmin and admin rows of users.json. Customer rows in the same
// file are not listed or changed here. The main admin account is listed first and cannot be changed here.
// The email is the sign-in name, so it is required unless the user already signs in with a username.
function userFields(body, rows, ignoreId) {
  const existing = rows.find(u => u.id === ignoreId);
  const name = validate.text(body.name, 'Name', { required: true });
  const email = validate.email(body.email, { required: !(existing && existing.username) }) || null;
  const role = validate.oneOf(body.role, 'Role', ROLES, '');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Choose a role.');
  if (email && users.emailTaken(rows, email, ignoreId)) throw new HttpError(409, 'A user with this email already exists.');
  return { name, email, role };
}

const listUsers = () => users.read().filter(users.isStaff).map(auth.publicUser);

function findUser(rows, id) {
  const index = rows.findIndex(u => u.id === id && users.isStaff(u));
  if (index < 0) throw new HttpError(404, 'User not found.');
  if (rows[index].main) throw new HttpError(400, 'The main admin account is changed with Change password, not here.');
  return index;
}

// A new user needs a password to sign in with (their email is the username).
function createUser({ body }) {
  const rows = users.read();
  const user = { id: users.nextId(rows), ...userFields(body, rows), ...auth.hashPassword(auth.newPassword(body.password)), created: new Date().toISOString() };
  rows.push(user);
  users.write(rows);
  return auth.publicUser(user);
}

// Leaving the password empty keeps it; a new password signs the user out everywhere.
function updateUser({ body, user: me }) {
  const rows = users.read();
  const index = findUser(rows, body.id);
  const fields = userFields(body, rows, rows[index].id);
  if (rows[index].id === me.id && fields.role !== rows[index].role) throw new HttpError(400, 'You cannot change your own role.');
  const password = String(body.password || '');
  rows[index] = { ...rows[index], ...fields, ...(password && auth.hashPassword(auth.newPassword(password))) };
  users.write(rows);
  if (password && rows[index].id !== me.id) auth.endSessions(rows[index].id);
  return auth.publicUser(rows[index]);
}

function deleteUser({ body, user: me }) {
  const rows = users.read();
  const index = findUser(rows, body.id);
  if (rows[index].id === me.id) throw new HttpError(400, 'You cannot remove your own account.');
  const [removed] = rows.splice(index, 1);
  users.write(rows);
  auth.endSessions(removed.id);
  return { ok: true, id: removed.id };
}

const created = handler => Object.assign(ctx => {
  ctx.status = 201;
  return handler(ctx);
}, { raw: handler.raw, superOnly: handler.superOnly });
const superOnly = handler => Object.assign(handler, { superOnly: true });

module.exports = {
  'GET /api/crm/orders': () => store.read('orders'),
  'GET /api/crm/customers': () => store.read('customers'),
  'GET /api/crm/leads': () => store.read('leads'),
  'GET /api/crm/users': superOnly(listUsers),
  'POST /api/crm/users': created(superOnly(createUser)),
  'PUT /api/crm/users': superOnly(updateUser),
  'DELETE /api/crm/users': superOnly(deleteUser),
  'POST /api/crm/orders': created(createOrder),
  'PUT /api/crm/orders': updateOrder,
  'PUT /api/crm/leads': updateLead,
  'POST /api/crm/customers': created(createCustomer),
  'POST /api/crm/leads': created(createLead),
  'GET /api/crm/products': () => store.read('products'), // all products, hidden ones too
  'POST /api/crm/products': created(createProduct),
  'PUT /api/crm/products/stock': updateStock,
  'PUT /api/crm/products': updateProduct,
  'DELETE /api/crm/products': deleteProduct,
  'POST /api/crm/uploads': created(upload),
};
