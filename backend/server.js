// EA Luxury backend: JSON API under /api/* and the static frontend for everything else.
const http = require('http');
const { PORT, FRONTEND_DIR, DATA_DIR } = require('./config');
const { HttpError, sendJson, readJson } = require('./lib/http');
const { serveStatic } = require('./lib/static');
const auth = require('./lib/auth');

const routes = {
  ...require('./routes/shop'),
  ...require('./routes/checkout'),
  ...require('./routes/crm'),
  ...auth.routes,
  ...require('./lib/accounts').routes,
};

// CRM files anyone may load: the sign-in page and the stylesheet it shares with the CRM.
const PUBLIC_ADMIN_FILES = ['/admin/login.html', '/admin/login.js', '/admin/admin.css'];
const isAdminPage = pathname => /^\/admin(\/|$)/.test(pathname) && !PUBLIC_ADMIN_FILES.includes(pathname);

async function handleApi(req, res, url) {
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    const pathExists = Object.keys(routes).some(key => key.split(' ')[1] === url.pathname);
    throw pathExists ? new HttpError(405, 'Method not allowed.') : new HttpError(404, 'Not found.');
  }
  // The CRM API is for signed-in CRM users only, and routes marked `superOnly` (user management) for Super Admins.
  // Checked before any body is read, so uploads are refused early.
  const user = url.pathname.startsWith('/api/crm/') ? auth.requireAdmin(req) : null;
  if (handler.superOnly && user.role !== 'superadmin') throw new HttpError(403, 'Only a Super Admin can do this.');
  // Handlers marked `raw` (file uploads) read the request stream themselves.
  const hasJsonBody = ['POST', 'PUT', 'DELETE'].includes(req.method) && !handler.raw;
  const ctx = { req, url, user, status: 200, headers: {}, body: hasJsonBody ? await readJson(req) : {} };
  const data = await handler(ctx);
  sendJson(res, ctx.status, data, ctx.headers);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    // Signed-out visits to the CRM go to the sign-in page.
    if (isAdminPage(url.pathname) && !auth.sessionUser(req)) {
      res.writeHead(302, { Location: '/admin/login.html', 'Cache-Control': 'no-store' });
      return res.end();
    }
    return serveStatic(req, res, url.pathname);
  }

  try {
    await handleApi(req, res, url);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { ok: false, message: status === 500 ? 'Something went wrong on the server.' : err.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server, or start on another port (PowerShell: $env:PORT=4000; npm start).`);
    process.exit(1);
  }
  throw err;
});

const created = auth.ensureAccount();
server.listen(PORT, () => {
  console.log(`EA Luxury store: http://localhost:${PORT}`);
  console.log(`EA Luxury CRM:   http://localhost:${PORT}/admin/`);
  console.log(`Serving ${FRONTEND_DIR}, data in ${DATA_DIR}`);
  if (created) {
    console.log('');
    console.log('CRM sign-in created (shown only this once, keep it safe):');
    console.log(`  username: ${created.username}`);
    console.log(`  password: ${created.password}`);
    console.log('Change it in the CRM (your name, top right > Change password), or set ADMIN_PASSWORD before starting.');
  }
});
