/**
 * Deterministic icon generation: no binary assets checked in by hand, no image
 * dependency. Renders at 4x and box-filters down so the rounded corners and the
 * accent bar stay smooth at 16px.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const TRANSPARENT = [0, 0, 0, 0];
const CARD = [11, 11, 15, 255];
const ACCENT = [249, 115, 22, 255];
const BAR = [161, 161, 170, 255];

function insideRoundedRect(px, py, x, y, width, height, radius) {
  if (px < x || py < y || px > x + width || py > y + height) return false;
  const nearestX = Math.min(Math.max(px, x + radius), x + width - radius);
  const nearestY = Math.min(Math.max(py, y + radius), y + height - radius);
  const dx = px - nearestX;
  const dy = py - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

/** Colour at a normalised point (0..1 in both axes). */
function colorAt(nx, ny) {
  const margin = 0.035;
  const size = 1 - margin * 2;
  if (!insideRoundedRect(nx, ny, margin, margin, size, size, size * 0.24)) return TRANSPARENT;

  const barLeft = 0.27;
  const barWidth = 0.46;
  const barHeight = 0.085;
  const radius = barHeight / 2;
  const tops = [0.265, 0.457, 0.649];

  for (let index = 0; index < tops.length; index += 1) {
    const top = tops[index];
    if (insideRoundedRect(nx, ny, barLeft, top, barWidth, barHeight, radius)) {
      return index === 0 ? ACCENT : BAR;
    }
  }

  return CARD;
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const nx = (x + (sx + 0.5) / SUPERSAMPLE) / size;
          const ny = (y + (sy + 0.5) / SUPERSAMPLE) / size;
          const [cr, cg, cb, ca] = colorAt(nx, ny);
          const alpha = ca / 255;
          r += cr * alpha;
          g += cg * alpha;
          b += cb * alpha;
          a += ca;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const alpha = a / samples;
      const offset = (y * size + x) * 4;
      const scale = alpha === 0 ? 0 : 255 / alpha;
      pixels[offset] = Math.round((r / samples) * scale);
      pixels[offset + 1] = Math.round((g / samples) * scale);
      pixels[offset + 2] = Math.round((b / samples) * scale);
      pixels[offset + 3] = Math.round(alpha);
    }
  }

  return pixels;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderPixels(size));
  await writeFile(join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png (${png.length} bytes)`);
}
