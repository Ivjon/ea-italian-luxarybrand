// CRM / admin API. Demo only: there is no authentication on these routes.
const store = require('../lib/store');
const validate = require('../lib/validate');
const { HttpError } = require('../lib/http');
const { saveUpload } = require('../lib/uploads');

const ORDER_STATUSES = ['Processing', 'Shipped', 'Delivered'];
const CATEGORIES = ['Women', 'Men', 'Unisex', 'Kids'];
const SIZE_TYPES = ['clothing', 'shoes', 'kids-clothing', 'kids-shoes']; // size charts, see frontend/catalog.js
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
  const fields = {
    brand: validate.text(body.brand, 'Brand', { required: true, max: 60 }),
    name: validate.text(body.name, 'Name', { required: true }),
    category: validate.oneOf(body.category, 'Category', CATEGORIES, 'Women'),
    type: validate.text(body.type, 'Type', { required: true, max: 40 }),
    price: validate.number(body.price, 'Price', { min: 1, max: 1e6 }),
    stock: sizes.length ? sizes.reduce((sum, s) => sum + s.qty, 0) : validate.number(body.stock, 'Stock', { min: 0, max: 1e5, integer: true }),
    sizes,
    sizeType: sizes.length ? validate.oneOf(body.sizeType, 'Size chart', SIZE_TYPES, 'clothing') : '',
    // shown with a "New arrival" label and in the home page's New Arrivals
    isNew: body.isNew === true || body.isNew === 'on' || body.isNew === 'true',
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
  const order = { id: store.nextId(orders, 'EA', 10001), customer: customer.name, items, total, status, date: today() };
  orders.unshift(order); // newest first, like the existing data

  customer.orders += 1;
  customer.spent += total;
  if (customer.status === 'New') customer.status = 'Active';

  store.write('orders', orders);
  store.write('customers', customers);
  return order;
}

const created = handler => Object.assign(ctx => {
  ctx.status = 201;
  return handler(ctx);
}, { raw: handler.raw });

module.exports = {
  'GET /api/crm/orders': () => store.read('orders'),
  'GET /api/crm/customers': () => store.read('customers'),
  'GET /api/crm/leads': () => store.read('leads'),
  'POST /api/crm/orders': created(createOrder),
  'POST /api/crm/customers': created(createCustomer),
  'POST /api/crm/leads': created(createLead),
  'POST /api/crm/products': created(createProduct),
  'PUT /api/crm/products': updateProduct,
  'DELETE /api/crm/products': deleteProduct,
  'POST /api/crm/uploads': created(upload),
};
