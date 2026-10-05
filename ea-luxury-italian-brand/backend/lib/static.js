// Serves the files in frontend/ (storefront at /, CRM at /admin/).
const fs = require('fs');
const path = require('path');
const { FRONTEND_DIR } = require('../config');
const { sendText } = require('./http');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  if (decoded.includes('\0')) return sendText(res, 400, 'Bad request');

  let filePath = path.resolve(FRONTEND_DIR, '.' + path.posix.normalize(decoded));
  if (filePath !== FRONTEND_DIR && !filePath.startsWith(FRONTEND_DIR + path.sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) {
      // /admin -> /admin/ so relative URLs inside the page resolve correctly
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' });
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) return sendText(res, 404, 'Not found');
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

module.exports = { serveStatic };
