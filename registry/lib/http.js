'use strict';
const zlib = require('node:zlib');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Disposition, Retry-After',
  'Access-Control-Max-Age': '86400'
};

function send(req, res, status, body, headers = {}) {
  const h = Object.assign({ 'X-Content-Type-Options': 'nosniff' }, CORS, headers);
  let payload = body;
  if (payload === undefined || payload === null) payload = Buffer.alloc(0);
  else if (!Buffer.isBuffer(payload)) payload = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const type = h['Content-Type'] || '';
  if (payload.length > 1024 && /json|text/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    payload = zlib.gzipSync(payload);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = payload.length;
  res.writeHead(status, h);
  res.end(payload);
}

function sendJson(req, res, status, obj, headers) {
  send(req, res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
}

// Reads the request body up to `limit` bytes; rejects with 413 beyond that.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => new HttpError(413, 'Request body too large (max ' + Math.round(limit / 1024) + ' KB)', { close: true });
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(tooLarge());
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject(tooLarge());
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (err) => { if (!done) { done = true; reject(err); } });
  });
}

function parseJson(buf) {
  if (!buf.length) throw new HttpError(400, 'Request body is empty; expected a JSON object');
  let v;
  try { v = JSON.parse(buf.toString('utf8')); } catch (_) { throw new HttpError(400, 'Request body is not valid JSON'); }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Request body must be a JSON object');
  return v;
}

module.exports = { HttpError, send, sendJson, readBody, parseJson, CORS };
