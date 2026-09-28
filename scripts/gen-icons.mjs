// Generates the PWA / home-screen icons into public/ with no dependencies.
// Run: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel((x + 0.5) / size, (y + 0.5) / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Neon player orb: dark background, glowing cyan ring, white core.
const BG = [7, 6, 15];
const CYAN = [94, 242, 255];
function pixel(u, v) {
  const d = Math.hypot(u - 0.5, v - 0.5);
  const ring = Math.abs(d - 0.27);
  const glow = Math.exp(-((ring / 0.06) ** 2)) * 0.9 + Math.exp(-((ring / 0.018) ** 2));
  const core = Math.exp(-((d / 0.07) ** 2));
  const halo = Math.exp(-((d / 0.33) ** 2)) * 0.12;
  const mix = (c, i) => Math.min(255, Math.round(BG[i] + c * (glow + halo) + 255 * core));
  return [mix(CYAN[0], 0), mix(CYAN[1], 1), mix(CYAN[2], 2)];
}

mkdirSync('public', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${name}`, png(size, pixel));
  console.log('wrote', name);
}
