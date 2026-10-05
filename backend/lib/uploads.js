// Saves a product photo or video uploaded from the CRM (raw request body) into UPLOAD_DIR under a random name.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { UPLOAD_DIR } = require('../config');
const { HttpError } = require('./http');

const MB = 1024 * 1024;
const LIMITS = { image: 15 * MB, video: 95 * MB }; // videos stay under GitHub's 100 MB per-file limit

// Accepted Content-Types, the extension they are stored with, and a check of the file's first bytes
// so a renamed file (e.g. a script called photo.jpg) is rejected.
const TYPES = {
  'image/jpeg': { kind: 'image', ext: '.jpg', ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', ext: '.png', ok: b => b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  'image/webp': { kind: 'image', ext: '.webp', ok: b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  'image/gif': { kind: 'image', ext: '.gif', ok: b => b.toString('latin1', 0, 4) === 'GIF8' },
  'video/mp4': { kind: 'video', ext: '.mp4', ok: b => b.toString('latin1', 4, 8) === 'ftyp' },
  'video/quicktime': { kind: 'video', ext: '.mov', ok: b => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(b.toString('latin1', 4, 8)) },
  'video/webm': { kind: 'video', ext: '.webm', ok: b => b.readUInt32BE(0) === 0x1a45dfa3 },
};

async function saveUpload(req) {
  const type = TYPES[String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()];
  if (!type) throw new HttpError(415, 'Upload a JPG, PNG, WebP or GIF photo, or an MP4, MOV or WebM video.');
  const limit = LIMITS[type.kind];
  const tooBig = () => new HttpError(413, `${type.kind === 'video' ? 'Videos' : 'Photos'} can be up to ${limit / MB} MB.`);
  if (Number(req.headers['content-length']) > limit) throw tooBig();

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomUUID() + type.ext;
  const part = path.join(UPLOAD_DIR, `${name}.part`);
  let size = 0;
  const count = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > limit ? tooBig() : null, chunk);
    },
  });
  try {
    await pipeline(req, count, fs.createWriteStream(part));
    const head = Buffer.alloc(12);
    const fd = fs.openSync(part, 'r');
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (size < 12 || !type.ok(head)) throw new HttpError(400, `This file is not a valid ${type.kind}.`);
    fs.renameSync(part, path.join(UPLOAD_DIR, name));
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw err instanceof HttpError ? err : new HttpError(400, 'The upload did not complete.');
  }
  return { type: type.kind, src: `/assets/uploads/${name}` };
}

module.exports = { saveUpload };
