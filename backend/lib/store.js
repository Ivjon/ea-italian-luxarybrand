// Tiny JSON-file persistence. Each collection lives in backend/data/<name>.json.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const file = name => path.join(DATA_DIR, `${name}.json`);

function read(name) {
  return JSON.parse(fs.readFileSync(file(name), 'utf8'));
}

function write(name, rows) {
  fs.writeFileSync(file(name), JSON.stringify(rows, null, 2) + '\n');
}

// Next id after the highest existing one, e.g. nextId(rows, 'C', 1001) -> 'C1006'.
// Based on the max rather than rows.length so ids stay unique if rows are removed.
function nextId(rows, prefix, first) {
  const highest = rows.reduce((max, row) => {
    const n = Number(String(row.id).slice(prefix.length));
    return String(row.id).startsWith(prefix) && Number.isInteger(n) && n > max ? n : max;
  }, first - 1);
  return `${prefix}${highest + 1}`;
}

module.exports = { read, write, nextId };
