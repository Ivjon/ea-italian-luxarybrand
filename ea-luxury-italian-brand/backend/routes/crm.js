// CRM / admin API. Demo only: there is no authentication on these routes.
const store = require('../lib/store');
const validate = require('../lib/validate');
const { HttpError } = require('../lib/http');

const ORDER_STATUSES = ['Processing', 'Shipped', 'Delivered'];
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

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

const created = handler => ctx => {
  ctx.status = 201;
  return handler(ctx);
};

module.exports = {
  'GET /api/crm/orders': () => store.read('orders'),
  'GET /api/crm/customers': () => store.read('customers'),
  'GET /api/crm/leads': () => store.read('leads'),
  'POST /api/crm/orders': created(createOrder),
  'POST /api/crm/customers': created(createCustomer),
  'POST /api/crm/leads': created(createLead),
};
