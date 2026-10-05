const path = require('path');

const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend'));

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  FRONTEND_DIR,
  // Product photos and videos uploaded in the CRM, served at /assets/uploads/.
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || path.join(FRONTEND_DIR, 'assets', 'uploads')),
};
