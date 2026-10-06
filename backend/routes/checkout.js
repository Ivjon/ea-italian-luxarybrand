// Store checkout: the bag becomes an order in the CRM. Prices and stock always come from products.json, never the browser.
const store = require('../lib/store');
const validate = require('../lib/validate');
const { HttpError } = require('../lib/http');
const { sessionAccount } = require('../lib/accounts');

// Delivery and payment choices offered at checkout (the prices here are the ones charged).
const DELIVERY = [
  { key: 'standard', label: 'Standard delivery', note: '3–5 business days', price: 0 },
  { key: 'express', label: 'Express delivery', note: '1–2 business days', price: 25 },
];
const PAYMENT = [
  { key: 'cod', label: 'Cash on delivery', note: 'Pay the courier when your order arrives.' },
  { key: 'transfer', label: 'Bank transfer', note: 'A client advisor will send you the bank details. Your order ships once the payment arrives.' },
];
const MAX_ITEMS = 50;
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

// What a piece costs after its discount, rounded like the store shows it.
const priceOf = p => (p.discount ? Math.round((p.price * (100 - p.discount)) / 100) : p.price);
const hasSizes = p => Array.isArray(p.sizes) && p.sizes.length > 0;
const colorNames = p => (p.colors || (p.color ? [{ name: p.color }] : [])).map(c => c.name);

function contactFields(body) {
  const c = body.contact || {};
  const a = body.address || {};
  const phone = validate.text(c.phone, 'Phone', { required: true, max: 30 });
  if (!/^[+0-9 ()./-]+$/.test(phone) || phone.replace(/\D/g, '').length < 6) throw new HttpError(400, 'Please enter a valid phone number.');
  return {
    firstName: validate.text(c.firstName, 'First name', { required: true, max: 60 }),
    lastName: validate.text(c.lastName, 'Last name', { required: true, max: 60 }),
    email: validate.email(c.email),
    phone,
    address: {
      line1: validate.text(a.line1, 'Address', { required: true }),
      line2: validate.text(a.line2, 'Apartment, suite, floor'),
      postalCode: validate.text(a.postalCode, 'Postal code', { required: true, max: 20 }),
      city: validate.text(a.city, 'City', { required: true, max: 80 }),
      country: validate.text(a.country, 'Country', { required: true, max: 60 }),
    },
  };
}

// Bag items ({id, color, size}) grouped into order lines with a quantity, each checked against the product.
function bagLines(items, products) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Your bag is empty.');
  if (items.length > MAX_ITEMS) throw new HttpError(400, `An order can hold up to ${MAX_ITEMS} pieces.`);
  const lines = [];
  for (const item of items) {
    const product = products.find(p => p.id === String((item && item.id) || ''));
    if (!product || product.hidden) throw new HttpError(409, 'A piece in your bag is no longer available. Please remove it and try again.');
    const size = hasSizes(product) ? String(item.size || '') : '';
    if (hasSizes(product) && !product.sizes.some(s => s.size === size)) throw new HttpError(400, `Please choose a size for ${product.name}.`);
    const color = colorNames(product).includes(item.color) ? item.color : '';
    const line = lines.find(l => l.product === product && l.size === size && l.color === color);
    if (line) line.qty += 1;
    else lines.push({ product, size, color, qty: 1 });
  }
  return lines;
}

// Stock is per size for sized pieces, otherwise the product's stock; colours share it.
const stockOf = l => (hasSizes(l.product) ? l.product.sizes.find(s => s.size === l.size).qty : l.product.stock);
const sameStock = (a, b) => a.product === b.product && a.size === b.size;

function checkStock(lines) {
  for (const line of lines) {
    const wanted = lines.filter(l => sameStock(l, line)).reduce((n, l) => n + l.qty, 0);
    const left = stockOf(line);
    if (wanted > left) {
      const piece = `${line.product.name}${line.size ? ` in size ${line.size}` : ''}`;
      throw new HttpError(409, left ? `Only ${left} left of ${piece}. Please update your bag.` : `${piece} has just sold out. Please remove it from your bag.`);
    }
  }
}

function takeStock(lines) {
  for (const { product, size, qty } of lines) {
    if (hasSizes(product)) {
      product.sizes.find(s => s.size === size).qty -= qty;
      product.stock = product.sizes.reduce((n, s) => n + s.qty, 0);
    } else {
      product.stock -= qty;
    }
  }
}

function placeOrder({ req, body }) {
  const account = sessionAccount(req); // a signed-in customer finds this order under My account
  const { firstName, lastName, email, phone, address } = contactFields(body);
  const delivery = DELIVERY.find(d => d.key === body.delivery);
  if (!delivery) throw new HttpError(400, 'Please choose a delivery option.');
  const payment = PAYMENT.find(p => p.key === body.payment);
  if (!payment) throw new HttpError(400, 'Please choose a payment method.');
  const note = validate.text(body.note, 'Order note', { max: 500 });

  const products = store.read('products');
  const lines = bagLines(body.items, products);
  checkStock(lines);
  takeStock(lines);

  const subtotal = lines.reduce((n, l) => n + priceOf(l.product) * l.qty, 0);
  const name = `${firstName} ${lastName}`;
  const orders = store.read('orders');
  const order = {
    id: store.nextId(orders, 'EA', 10001),
    customer: name,
    email,
    phone,
    items: lines.reduce((n, l) => n + l.qty, 0),
    lines: lines.map(({ product: p, size, color, qty }) => ({
      productId: p.id, brand: p.brand, name: p.name, image: p.image, ...(color && { color }), ...(size && { size }), qty, price: priceOf(p),
    })),
    subtotal,
    shipping: delivery.price,
    total: subtotal + delivery.price,
    delivery: `${delivery.label}, ${delivery.note}`,
    payment: payment.label,
    address,
    ...(note && { note }),
    // Bank transfers wait in the CRM's Awaiting Payment column until the money arrives; the rest can ship.
    status: payment.key === 'transfer' ? 'Awaiting Payment' : 'Processing',
    date: today(),
    source: 'Website',
    ...(account && { account: account.email }),
  };
  orders.unshift(order); // newest first, like the CRM's orders

  // The buyer becomes (or updates) a CRM customer, matched by email.
  const customers = store.read('customers');
  let customer = customers.find(c => c.email.toLowerCase() === email);
  if (!customer) {
    customer = { id: store.nextId(customers, 'C', 1001), name, email, city: address.city, orders: 0, spent: 0, status: 'New' };
    customers.push(customer);
  }
  customer.orders += 1;
  customer.spent += order.total;
  if (customer.status === 'New') customer.status = 'Active';

  store.write('products', products);
  store.write('orders', orders);
  store.write('customers', customers);
  return { ok: true, order, paymentNote: payment.note };
}

module.exports = {
  'GET /api/checkout': () => ({ delivery: DELIVERY, payment: PAYMENT }),
  'POST /api/checkout': ctx => {
    ctx.status = 201;
    return placeOrder(ctx);
  },
};
