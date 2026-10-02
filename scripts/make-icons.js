#!/usr/bin/env node
'use strict';
// Renders the app icon (build/icon.png, build/icon.ico, build/tray.png) with no dependencies.
// A gradient rounded square holding a 2x2 grid of widget tiles. Re-run after changing the design.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'build');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Signed distance to a rounded rectangle centred at (cx, cy).
function sdRound(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

const mix = (a, b, t) => a + (b - a) * t;

function render(size, options = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 3;
  const tiles = options.simple
    ? [[0.5, 0.5, 0.3, 0.3]]
    : [[0.335, 0.335, 0.155, 0.155], [0.665, 0.335, 0.155, 0.155], [0.335, 0.665, 0.155, 0.155], [0.665, 0.665, 0.155, 0.155]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          const bg = sdRound(u, v, 0.5, 0.5, 0.5, 0.5, 0.22);
          if (bg > 0) continue;
          // diagonal gradient cyan -> violet
          const t = Math.min(1, Math.max(0, (u + v) / 2));
          let cr = mix(0, 131, t), cg = mix(245, 56, t), cb = mix(212, 236, t);
          let alpha = 1;
          tiles.forEach(([tx, ty, hw, hh], i) => {
            const d = sdRound(u, v, tx, ty, hw, hh, 0.055);
            if (d < 0) {
              const strength = options.simple || i === 3 ? 1 : 0.88;
              cr = mix(cr, 255, strength); cg = mix(cg, 255, strength); cb = mix(cb, 255, strength);
              if (i === 3 && !options.simple) { cr = 255; cg = 255; cb = 255; }
            }
          });
          r += cr; g += cg; b += cb; a += alpha;
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      if (a > 0) { buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a); }
      buf[o + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, buf);
}

function ico(sizes) {
  const images = sizes.map((s) => render(s, { simple: s <= 24 }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const s = sizes[i];
    dir[i * 16] = s >= 256 ? 0 : s; dir[i * 16 + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(img.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12);
    offset += img.length;
  });
  return Buffer.concat([header, dir, ...images]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), render(512));
fs.writeFileSync(path.join(OUT, 'tray.png'), render(32, { simple: true }));
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('wrote build/icon.png, build/tray.png, build/icon.ico');
