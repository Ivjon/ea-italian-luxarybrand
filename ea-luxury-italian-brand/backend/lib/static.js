// Serves the files in frontend/ (storefront at /, CRM at /admin/) and CRM uploads at /assets/uploads/.
const fs = require('fs');
const path = require('path');
const { FRONTEND_DIR, UPLOAD_DIR } = require('../config');
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
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};
const UPLOADS_URL = '/assets/uploads/';

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  if (decoded.includes('\0')) return sendText(res, 400, 'Bad request');

  const normalized = path.posix.normalize(decoded);
  const [root, rel] = normalized.startsWith(UPLOADS_URL)
    ? [UPLOAD_DIR, normalized.slice(UPLOADS_URL.length)]
    : [FRONTEND_DIR, normalized];
  let filePath = path.resolve(root, '.' + path.posix.sep + rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
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
      return fs.stat(filePath, (indexErr, indexStat) => (indexErr ? sendText(res, 404, 'Not found') : sendFile(req, res, filePath, indexStat.size)));
    }
    if (statErr || !stat.isFile()) return sendText(res, 404, 'Not found');
    sendFile(req, res, filePath, stat.size);
  });
}

// Streams the file, honouring a single byte range (needed for video seeking, and by Safari to play video at all).
function sendFile(req, res, filePath, size) {
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Cache-Control': /^(image|video)\//.test(type) ? 'public, max-age=86400' : 'no-cache',
    'Accept-Ranges': 'bytes',
  };
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2]) && size > 0) {
    start = range[1] ? Number(range[1]) : Math.max(size - Number(range[2]), 0);
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = size > 0 ? end - start + 1 : 0;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  fs.createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res);
}

module.exports = { serveStatic };
