const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size;
  const put = (x, y, r, g, b, a) => {
    if (a <= 0) return;
    const i = (y * S + x) * 4;
    const na = a;
    const ia = buf[i + 3] / 255;
    const oa = na + ia * (1 - na);
    if (oa <= 0) return;
    buf[i] = Math.round((r * na + buf[i] * ia * (1 - na)) / oa);
    buf[i + 1] = Math.round((g * na + buf[i + 1] * ia * (1 - na)) / oa);
    buf[i + 2] = Math.round((b * na + buf[i + 2] * ia * (1 - na)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };
  const aa = d => Math.max(0, Math.min(1, 0.5 - d * S));

  const bgTop = hex('#1b2748');
  const bgBot = hex('#0a0e1a');
  const beam = hex('#5a6d95');
  const bigFill = hex('#5ee6a8'), bigEdge = hex('#2f9d74');
  const smFill = hex('#57c9f2'), smEdge = hex('#2b7fa8');

  const k = maskable ? 0.74 : 1;
  const cxc = 0.5, cyc = 0.5;
  const P = (x, y) => ({ x: cxc + (x - 0.5) * k, y: cyc + (y - 0.5) * k });

  const roundRect = (x, y, cx, cy, hw, hh, r) => {
    const dx = Math.abs(x - cx) - (hw - r);
    const dy = Math.abs(y - cy) - (hh - r);
    const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
    return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
  };
  const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S;
      const t = v;
      let r = Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t);
      let g = Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t);
      let b = Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t);
      let a = 255;
      if (!maskable) {
        const d = roundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22);
        a = Math.round(aa(d) * 255);
      }
      put(x, y, r, g, b, a);
      if (a <= 0) continue;

      const beamP = P(0.5, 0.3425);
      const db = roundRect(u, v, beamP.x, beamP.y, 0.34 * k, 0.0225 * k, 0.0225 * k);
      const ab = aa(db);
      if (ab > 0) put(x, y, beam[0], beam[1], beam[2], ab);

      const big = P(0.5, 0.205);
      const dbig = circle(u, v, big.x, big.y, 0.095 * k);
      const abig = aa(dbig);
      if (abig > 0) put(x, y, bigEdge[0], bigEdge[1], bigEdge[2], abig);
      const dbigIn = circle(u, v, big.x, big.y, 0.095 * k - 0.016 * k);
      const abigIn = aa(dbigIn);
      if (abigIn > 0) put(x, y, bigFill[0], bigFill[1], bigFill[2], abigIn);

      [0.455, 0.617, 0.779].forEach(cy => {
        const c = P(0.5, cy);
        const dOut = circle(u, v, c.x, c.y, 0.07 * k);
        const aOut = aa(dOut);
        if (aOut > 0) put(x, y, smEdge[0], smEdge[1], smEdge[2], aOut);
        const dIn = circle(u, v, c.x, c.y, 0.07 * k - 0.013 * k);
        const aIn = aa(dIn);
        if (aIn > 0) put(x, y, smFill[0], smFill[1], smFill[2], aIn);
      });
    }
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true]
];
for (const [name, size, maskable] of jobs) {
  const buf = draw(size, maskable);
  fs.writeFileSync(path.join(outDir, name), png(size, buf));
  console.log(name, size + 'x' + size, fs.statSync(path.join(outDir, name)).size + ' bytes');
}
