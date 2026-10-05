const path = require('path');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')),
  FRONTEND_DIR: path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend')),
};
