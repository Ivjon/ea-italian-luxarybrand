// EA Luxury backend: JSON API under /api/* and the static frontend for everything else.
const http = require('http');
const { PORT, FRONTEND_DIR, DATA_DIR } = require('./config');
const { HttpError, sendJson, readJson } = require('./lib/http');
const { serveStatic } = require('./lib/static');

const routes = {
  ...require('./routes/shop'),
  ...require('./routes/crm'),
};

async function handleApi(req, res, url) {
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    const pathExists = Object.keys(routes).some(key => key.split(' ')[1] === url.pathname);
    throw pathExists ? new HttpError(405, 'Method not allowed.') : new HttpError(404, 'Not found.');
  }
  // Handlers marked `raw` (file uploads) read the request stream themselves.
  const hasJsonBody = ['POST', 'PUT', 'DELETE'].includes(req.method) && !handler.raw;
  const ctx = { req, url, status: 200, body: hasJsonBody ? await readJson(req) : {} };
  const data = await handler(ctx);
  sendJson(res, ctx.status, data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

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

server.listen(PORT, () => {
  console.log(`EA Luxury store: http://localhost:${PORT}`);
  console.log(`EA Luxury CRM:   http://localhost:${PORT}/admin/`);
  console.log(`Serving ${FRONTEND_DIR}, data in ${DATA_DIR}`);
});
