// socialCard.js — make a branded 1080×1350 (4:5) JPEG for a social post in a studio's palette.
// 4:5 is accepted by Instagram, Facebook and Bluesky. Needs `sharp` (npm i sharp).
//
// renderCard({ layout?, studio, kicker?, title, lines?, footer?, photo?, photos?, framed?, arrange?, palette? }) → Promise<Buffer>
//   layout   'card' (default) | 'frame' | 'photo' | 'collage'
//            card    — text card in the studio palette, optional photo on top (title required)
//            frame   — one photo filling the image, palette border + bottom band (title or studio name, footer url)
//            photo   — one photo cropped to 4:5, nothing added
//            collage — 2–4 photos stitched into one image; framed:true adds the border + band
//   photos   collage: [Buffer | path | URL] (2–4). frame/photo use photo (or photos[0])
//   arrange  collage with 2 photos: 'rows' (stacked, default) | 'cols' (side by side)
//   studio   'flourish' | 'iy-sp' — picks the palette from config/socialPalettes.js
//   kicker   small label above the title, e.g. 'WORKSHOP'
//   title    main text (wraps, shrinks to fit)
//   lines    detail lines, e.g. ['Sat, Nov 15 · 10:00–12:00', 'with Dominique']
//   footer   defaults to the palette's url
//   photo    Buffer | local path | https URL — shown in the top half, cropped to fit
//   palette  per-post overrides of any palette key
//
// saveCard(buffer) → { file, path, url, width, height, bytes, mimeType }  (ready to use as a post image)

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

let PALETTES = {};
try { PALETTES = require('./config/socialPalettes'); } catch { /* no palettes file */ }

const W = 1080, H = 1350, PAD = 90;
const CARD_DIR = process.env.SOCIAL_CARD_DIR || path.join(__dirname, 'uploads', 'social');
const CARD_BASE = (process.env.PUBLIC_API_URL || 'https://iy-sp.com/api').replace(/\/$/, '') + '/social/cards';

const DEFAULT_PALETTE = {
  name: '', url: '',
  background: '#ffffff', surface: '#f4f4f4', border: '#e0e0e0',
  text: '#222222', textMid: '#555555', textMuted: '#888888',
  accent: '#444444', accent2: '#888888',
  fontSerif: "Georgia, 'DejaVu Serif', serif", fontSans: "'DejaVu Sans', sans-serif",
};

function paletteFor(studio, overrides = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(overrides || {})) {
    if (!(k in DEFAULT_PALETTE) || typeof v !== 'string') continue;
    if (/^(background|surface|border|text|textMid|textMuted|accent|accent2)$/.test(k) && !/^#[0-9a-f]{3,8}$/i.test(v)) continue;
    clean[k] = v;
  }
  return { ...DEFAULT_PALETTE, ...(PALETTES[studio] || {}), ...clean };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rough word wrap: average glyph width ≈ ratio × font size.
function wrap(text, fontSize, maxWidth, ratio) {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * ratio)));
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) { line = next; continue; }
    if (line) out.push(line);
    line = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
  }
  if (line) out.push(line);
  return out;
}

async function loadPhoto(photo) {
  if (!photo) return null;
  if (Buffer.isBuffer(photo)) return photo;
  if (/^https?:\/\//.test(photo)) {
    const res = await fetch(photo);
    if (!res.ok) throw new Error(`Couldn't fetch photo ${photo} (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.promises.readFile(photo);
}

const LAYOUTS = ['card', 'frame', 'photo', 'collage'];

async function renderCard(opts = {}) {
  const layout = opts.layout || 'card';
  if (!LAYOUTS.includes(layout)) throw new Error(`Unknown layout: ${layout}`);
  if (layout === 'card') return renderTextCard(opts);
  const p = paletteFor(opts.studio, opts.palette);
  const sources = (opts.photos && opts.photos.length ? opts.photos : [opts.photo]).filter(Boolean);
  if (layout === 'collage') {
    if (sources.length < 2 || sources.length > 4) throw new Error('A collage needs 2–4 photos.');
  } else if (!sources.length) throw new Error(`The ${layout} layout needs a photo.`);
  const bufs = await Promise.all((layout === 'collage' ? sources : sources.slice(0, 1)).map(loadPhoto));

  const fill = (buf, w, h) => sharp(buf).rotate().resize(Math.round(w), Math.round(h), { fit: 'cover', position: 'attention' }).toBuffer();

  if (layout === 'photo') {
    return sharp(await fill(bufs[0], W, H)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }

  const framed = layout === 'frame' || !!opts.framed;
  const B = framed ? 36 : 0;          // border
  const BAND = framed ? 170 : 0;      // bottom band
  const GAP = 12;                     // between collage tiles
  const area = { x: B, y: B, w: W - B * 2, h: H - B * 2 - BAND };

  const rects = layout === 'frame' ? [area] : tiles(bufs.length, opts.arrange, area, GAP);
  const composites = await Promise.all(rects.map(async (r, i) => ({
    input: await fill(bufs[i], r.w, r.h), left: Math.round(r.x), top: Math.round(r.y),
  })));

  const parts = [`<rect width="${W}" height="${H}" fill="${p.background}"/>`];
  if (framed) {
    const by = H - B - BAND;
    parts.push(`<rect x="${B}" y="${by}" width="${W - B * 2}" height="6" fill="${p.accent}"/>`);
    const footer = opts.footer ?? p.url;
    const title = opts.title ? String(opts.title) : '';
    if (title) {
      const line = wrap(title, 54, W - B * 2 - 40, 0.56)[0] || '';
      const more = wrap(title, 54, W - B * 2 - 40, 0.56).length > 1;
      parts.push(`<text x="${B + 20}" y="${by + 78}" font-family="${esc(p.fontSerif)}" font-size="54" fill="${p.text}">${esc(more ? line.replace(/\s*\S?$/, '…') : line)}</text>`);
    } else {
      parts.push(`<text x="${B + 20}" y="${by + 72}" font-family="${esc(p.fontSans)}" font-size="34" letter-spacing="4" fill="${p.text}" font-weight="600">${esc(String(p.name).toUpperCase())}</text>`);
    }
    if (footer) parts.push(`<text x="${B + 20}" y="${by + 130}" font-family="${esc(p.fontSans)}" font-size="32" fill="${p.accent}" font-weight="600">${esc(footer)}</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  return sharp(Buffer.from(svg)).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

// Collage tile rectangles inside `a`.
function tiles(n, arrange, a, g) {
  const { x, y, w, h } = a;
  const halfW = (w - g) / 2, halfH = (h - g) / 2;
  if (n === 2) return arrange === 'cols'
    ? [{ x, y, w: halfW, h }, { x: x + halfW + g, y, w: halfW, h }]
    : [{ x, y, w, h: halfH }, { x, y: y + halfH + g, w, h: halfH }];
  if (n === 3) {
    const topH = Math.round((h - g) * 0.6), botH = h - g - topH;
    return [
      { x, y, w, h: topH },
      { x, y: y + topH + g, w: halfW, h: botH },
      { x: x + halfW + g, y: y + topH + g, w: halfW, h: botH },
    ];
  }
  return [
    { x, y, w: halfW, h: halfH }, { x: x + halfW + g, y, w: halfW, h: halfH },
    { x, y: y + halfH + g, w: halfW, h: halfH }, { x: x + halfW + g, y: y + halfH + g, w: halfW, h: halfH },
  ];
}

async function renderTextCard(opts = {}) {
  const p = paletteFor(opts.studio, opts.palette);
  const photoBuf = await loadPhoto(opts.photo);
  const inner = W - PAD * 2;
  const hasPhoto = !!photoBuf;

  const BRAND_Y = 120;
  const PHOTO_TOP = 190, PHOTO_MIN = 360, PHOTO_MAX = 700, PHOTO_GAP = 64;
  const CONTENT_BOTTOM = H - PAD - 120;            // footer lives below this
  const SERIF = 0.56, SANS = 0.56;

  const kicker = opts.kicker ? String(opts.kicker).toUpperCase() : '';
  const details = (opts.lines || []).filter(Boolean).slice(0, 3)
    .flatMap(l => wrap(l, 40, inner, SANS).slice(0, 2));
  const footer = opts.footer ?? p.url;

  // Measure the text block for a given title size.
  const measure = size => {
    const lines = wrap(opts.title || '', size, inner, SERIF);
    let h = 0;
    if (kicker) h += 30 + 34;
    h += size * 0.9 + (lines.length - 1) * size * 1.12 + size * 0.25;
    if (details.length) h += 24 + details.length * 52;
    return { size, lines, h };
  };

  // Biggest title that fits (leaving the photo at least PHOTO_MIN tall).
  const sizes = hasPhoto ? [84, 74, 64, 56, 50] : [112, 98, 86, 74, 64, 56];
  const maxLines = hasPhoto ? 3 : 5;
  const room = hasPhoto ? CONTENT_BOTTOM - (PHOTO_TOP + PHOTO_MIN + PHOTO_GAP) : CONTENT_BOTTOM - 220;
  let fit = sizes.map(measure).find(m => m.lines.length <= maxLines && m.h <= room);
  if (!fit) {
    fit = measure(sizes[sizes.length - 1]);
    fit.lines = fit.lines.slice(0, maxLines);
    fit.lines[maxLines - 1] = fit.lines[maxLines - 1].replace(/\s*\S?$/, '…');
    fit.h = measure(sizes[sizes.length - 1]).h;
  }

  let top, photoH = 0;
  if (hasPhoto) {
    top = CONTENT_BOTTOM - fit.h;
    photoH = Math.min(PHOTO_MAX, top - PHOTO_GAP - PHOTO_TOP);
    top = PHOTO_TOP + photoH + PHOTO_GAP;
  } else {
    top = 220 + Math.max(0, (CONTENT_BOTTOM - 220 - fit.h) * 0.4);
  }

  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${p.background}"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="14" fill="${p.accent}"/>`);
  parts.push(`<text x="${PAD}" y="${BRAND_Y}" font-family="${esc(p.fontSans)}" font-size="30" letter-spacing="4" fill="${p.accent}" font-weight="600">${esc(String(p.name).toUpperCase())}</text>`);
  parts.push(`<rect x="${PAD}" y="${BRAND_Y + 26}" width="${inner}" height="2" fill="${p.border}"/>`);
  if (hasPhoto) parts.push(`<rect x="${PAD}" y="${PHOTO_TOP}" width="${inner}" height="${photoH}" fill="${p.surface}"/>`);

  let y = top;
  if (kicker) {
    parts.push(`<text x="${PAD}" y="${Math.round(y + 30)}" font-family="${esc(p.fontSans)}" font-size="30" letter-spacing="5" fill="${p.accent2}" font-weight="600">${esc(kicker)}</text>`);
    y += 30 + 34;
  }
  fit.lines.forEach((line, i) => {
    const by = y + fit.size * 0.9 + i * fit.size * 1.12;
    parts.push(`<text x="${PAD}" y="${Math.round(by)}" font-family="${esc(p.fontSerif)}" font-size="${fit.size}" fill="${p.text}">${esc(line)}</text>`);
  });
  y += fit.size * 0.9 + (fit.lines.length - 1) * fit.size * 1.12 + fit.size * 0.25;
  if (details.length) {
    y += 24;
    for (const line of details) {
      parts.push(`<text x="${PAD}" y="${Math.round(y + 40)}" font-family="${esc(p.fontSans)}" font-size="40" fill="${p.textMid}">${esc(line)}</text>`);
      y += 52;
    }
  }

  if (footer) {
    const fy = H - PAD;
    parts.push(`<rect x="${PAD}" y="${fy - 62}" width="56" height="4" fill="${p.accent}"/>`);
    parts.push(`<text x="${PAD}" y="${fy}" font-family="${esc(p.fontSans)}" font-size="34" fill="${p.accent}" font-weight="600">${esc(footer)}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  let img = sharp(Buffer.from(svg));
  if (hasPhoto) {
    const fitted = await sharp(photoBuf).rotate().resize(inner, Math.round(photoH), { fit: 'cover', position: 'attention' }).toBuffer();
    img = img.composite([{ input: fitted, top: PHOTO_TOP, left: PAD }]);
  }
  return img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function saveCard(buffer) {
  await fs.promises.mkdir(CARD_DIR, { recursive: true });
  const file = crypto.randomBytes(12).toString('hex') + '.jpg';
  const full = path.join(CARD_DIR, file);
  await fs.promises.writeFile(full, buffer);
  return { file, path: full, url: `${CARD_BASE}/${file}`, width: W, height: H, bytes: buffer.length, mimeType: 'image/jpeg' };
}

const CARD_FILE_RE = /^[a-f0-9]{24}\.jpg$/;

module.exports = { renderCard, saveCard, paletteFor, CARD_DIR, CARD_FILE_RE, PALETTES, LAYOUTS };
