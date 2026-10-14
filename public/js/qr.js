// Individual QR codes for ambassador pages (used on nametags). Every ambassador's page lives at
// /ambassadors/<code>, where the code is the first 10 hex characters of their user id: short enough to keep
// the QR small and easy to scan on a nametag, and still unambiguous (40 bits for a few hundred people).
// QR encoding comes from the vendored qrcode-generator (MIT), loaded as the global `qrcode`.
import { SITE_URL } from './config.js';

export const ambCode = (id) => String(id).replace(/-/g, '').slice(0, 10).toLowerCase();
export const ambUrl = (id) => `${SITE_URL}/ambassadors/${ambCode(id)}`;

function matrix(text) {
  const q = window.qrcode(0, 'M'); // 0 = smallest version that fits; M = ~15% error correction
  q.addData(text); q.make();
  return q;
}

// Vector QR as an SVG string with a 4-module quiet zone (the minimum scanners expect).
export function qrSvg(text, { margin = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const q = matrix(text), n = q.getModuleCount(), size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// Raster QR (PNG blob) of about `px` pixels, always an integer number of pixels per module so edges stay sharp.
export function qrPng(text, px = 1024, margin = 4) {
  const q = matrix(text), n = q.getModuleCount(), total = n + margin * 2;
  const scale = Math.max(1, Math.floor(px / total)), side = total * scale;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_failed'))), 'image/png'));
}

// ── minimal ZIP writer (no compression: PNGs are already compressed and SVGs are small) ──────────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// files: [{ name: 'a.png', data: Uint8Array }] -> Blob (application/zip). Names must be plain ASCII/UTF-8 paths.
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // bit 11: UTF-8 names
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); // stored, DOS time 0, date 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true); cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(cen.buffer, name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ASCII-safe file name stem for a person: "LastName_FirstName_<code>".
export function qrFileStem(p) {
  const clean = (s) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '');
  const last = clean(p.last_name_en || p.last_name), first = clean(p.first_name_en || p.first_name);
  return [last, first, ambCode(p.id)].filter(Boolean).join('_');
}
