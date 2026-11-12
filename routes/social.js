// routes/social.js — mounted in index.js:
//   app.use("/api/social", require("./routes/social")(require("./middleware/auth").adminAuth));
//
// Multi-studio servers (config/studio STUDIOS has >1 entry, e.g. iy-sp + flourish) must say which
// studio's accounts to post from; single-studio servers use the unsuffixed .env keys.
//
// Public (Instagram / Facebook / Bluesky fetch these):
// GET  /api/social/cards/:file.jpg         → a generated post image
// GET  /api/social/videos/:file(.mp4|.jpg) → a prepared short + its poster frame
//
// Admin only:
// GET  /api/social/status                  → { "iy-sp": { facebook, instagram, bluesky }, "flourish": {…} }
// GET  /api/social/palettes                → each studio's card colours (config/socialPalettes.js)
// POST /api/social/card     { studio, card }               → renders + saves a card → image object
// POST /api/social/preview  { post, platforms? }           → formatted payloads + errors/warnings, nothing sent
// POST /api/social/publish  { studio, post, platforms? }   → { facebook: { ok, url|error, warnings }, … }
//                                                          video posts → { jobId } (uploads take minutes)
// POST /api/social/video    multipart: video (file), fit? 'blur'|'crop', start?, end?  → { jobId }
//                           job result = video object for post.video (socialVideo.prepareVideo)
// GET  /api/social/jobs/:id → { status: 'running'|'done'|'error', result?, error? }
//
// card = { layout?: 'card'|'frame'|'photo'|'collage', kicker?, title, lines?, footer?, photo?: url,
//          photos?: [url] (collage 2–4), framed?: bool (collage), arrange?: 'rows'|'cols' (2-photo collage),
//          alt?: string, palette?: { background?, text?, accent?, … } }
// title is required only for layout 'card'.
// A post with `card` gets the generated image as its first photo (alt text = title + lines).
//
// DEMO_MODE (florium-server / demo.florium.live): the demo logins are public, so their posts are
// simulated — everything up to the post itself runs (card, video, preview), nothing is sent.
// Users listed in SOCIAL_LIVE_USERS (comma-separated emails) post for real, from the unsuffixed keys.
// Single-studio servers always use the unsuffixed .env keys; `studio` only picks the card palette.

'use strict';

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { publishToSocial, connectedPlatforms, formatForSocial } = require('../socialPublish');
const { defaultPlatforms } = require('../socialFormat');
const { renderCard, saveCard, paletteFor, CARD_DIR, CARD_FILE_RE, PALETTES, LAYOUTS } = require('../socialCard');
const { prepareVideo, localPathFor, sweepVideos, VIDEO_DIR, VIDEO_FILE_RE } = require('../socialVideo');

let STUDIOS = [], DEMO_MODE = false;
try { ({ STUDIOS = [], DEMO_MODE = false } = require('../config/studio')); } catch { /* single-studio server */ }
const MULTI = STUDIOS.length > 1;
const LIVE_USERS = String(process.env.SOCIAL_LIVE_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const simulated = req => DEMO_MODE && !LIVE_USERS.includes(String((req.user && req.user.email) || '').toLowerCase());

const ALLOWED = ['facebook', 'instagram', 'bluesky', 'youtube'];
const VIDEO_MAX_MB = Number(process.env.SOCIAL_VIDEO_MAX_MB) || (DEMO_MODE ? 200 : 1024);
const VIDEO_JOBS_AT_ONCE = DEMO_MODE ? 1 : 2;
const VIDEO_KEEP_DAYS = Number(process.env.SOCIAL_VIDEO_KEEP_DAYS) || (DEMO_MODE ? 1 : 30);
const videoUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: VIDEO_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^video\//.test(file.mimetype)),
});

// Background jobs (video prep, video publishing). In memory: a pm2 restart drops running jobs.
const jobs = new Map();
function startJob(fn, kind = 'publish') {
  const id = crypto.randomBytes(8).toString('hex');
  const job = { status: 'running', kind, started: Date.now() };
  jobs.set(id, job);
  Promise.resolve().then(fn)
    .then(result => Object.assign(job, { status: 'done', result }))
    .catch(e => Object.assign(job, { status: 'error', error: e.message }))
    .finally(() => setTimeout(() => jobs.delete(id), 2 * 60 * 60 * 1000).unref());
  return id;
}

module.exports = function socialRoutes(requireAdmin) {
  if (typeof requireAdmin !== 'function') throw new Error('routes/social needs the admin auth middleware');
  const router = express.Router();

  // Public: generated card images (random 24-hex names, nothing else is served).
  router.get('/cards/:file', (req, res) => {
    if (!CARD_FILE_RE.test(req.params.file)) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(CARD_DIR, req.params.file), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  router.get('/videos/:file', (req, res) => {
    if (!VIDEO_FILE_RE.test(req.params.file)) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(VIDEO_DIR, req.params.file), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  router.use(requireAdmin);

  const fail = (status, message) => Object.assign(new Error(message), { status });

  const pickPlatforms = (platforms, post) => {
    const list = Array.isArray(platforms) && platforms.length ? platforms : defaultPlatforms(post);
    const bad = list.filter(p => !ALLOWED.includes(p));
    if (bad.length) throw fail(400, `Unknown platform(s): ${bad.join(', ')}`);
    return list;
  };

  const pickStudio = (studio, required) => {
    if (!MULTI) return studio || null;          // palette only; credentials stay unsuffixed (see accountFor)
    if (!studio) { if (required) throw fail(400, `studio is required (one of: ${STUDIOS.join(', ')})`); return null; }
    if (!STUDIOS.includes(studio)) throw fail(400, `Unknown studio: ${studio}`);
    return studio;
  };

  const makeCard = async (studio, card) => {
    if (!card) throw fail(400, 'card is required');
    const layout = card.layout || 'card';
    if (!LAYOUTS.includes(layout)) throw fail(400, `Unknown layout: ${layout}`);
    if (layout === 'card' && !card.title) throw fail(400, 'card.title is required');
    const photos = Array.isArray(card.photos) ? card.photos.filter(Boolean) : [];
    if (layout === 'collage' && (photos.length < 2 || photos.length > 4)) throw fail(400, 'A collage needs 2–4 photos.');
    if ((layout === 'frame' || layout === 'photo') && !card.photo && !photos.length) throw fail(400, `The ${layout} layout needs a photo.`);
    let buf;
    try {
      buf = await renderCard({
        layout, studio,
        kicker: card.kicker, title: card.title, lines: card.lines, footer: card.footer,
        photo: card.photo || null, photos, framed: !!card.framed, arrange: card.arrange,
        palette: card.palette,
      });
    } catch (e) { throw fail(400, e.message); }
    const img = await saveCard(buf);
    img.alt = card.alt || [card.title, ...(card.lines || [])].filter(Boolean).join('. ');
    return img;
  };

  const send = (res, e) => res.status(e.status || 500).json({ error: e.message });
  const accountFor = studio => (MULTI ? studio : null);
  const demoStatus = () => Object.fromEntries(ALLOWED.map(p => [p, 'demo']));

  router.get('/status', (req, res) => {
    if (simulated(req)) return res.json(MULTI ? Object.fromEntries(STUDIOS.map(s => [s, demoStatus()])) : demoStatus());
    res.json(MULTI
      ? Object.fromEntries(STUDIOS.map(s => [s, connectedPlatforms(s)]))
      : connectedPlatforms(null));
  });

  router.get('/palettes', (req, res) => {
    const ids = MULTI ? STUDIOS : Object.keys(PALETTES);
    res.json(Object.fromEntries(ids.map(s => [s, paletteFor(s)])));
  });

  router.post('/card', async (req, res) => {
    try {
      const { studio, card } = req.body || {};
      res.json(await makeCard(pickStudio(studio, true), card));
    } catch (e) { send(res, e); }
  });

  router.post('/preview', async (req, res) => {
    try {
      const { post, platforms, studio } = req.body || {};
      if (!post) return res.status(400).json({ error: 'post is required' });
      const p = { ...post };
      if (p.card) p.images = [await makeCard(pickStudio(studio, true), p.card), ...(p.images || [])];
      res.json({ images: p.images || [], ...formatForSocial(p, pickPlatforms(platforms, p)) });
    } catch (e) { send(res, e); }
  });

  router.post('/publish', async (req, res) => {
    try {
      const { post, platforms, studio } = req.body || {};
      if (!post) return res.status(400).json({ error: 'post is required' });
      const s = pickStudio(studio, true);
      const p = { ...post };
      if (p.video && !localPathFor(p.video.url)) throw fail(400, 'Upload the video here first (post.video must come from /api/social/video).');
      if (p.card && !p.video) p.images = [await makeCard(s, p.card), ...(p.images || [])];
      const list = pickPlatforms(platforms, p);
      if (simulated(req)) {
        const f = formatForSocial(p, list);
        return res.json(Object.fromEntries(list.map(k => [k, f[k].ok
          ? { ok: true, demo: true, warnings: f[k].warnings }
          : { ok: false, error: f[k].errors.join(' '), warnings: f[k].warnings }])));
      }
      const run = async () => {
        const results = await publishToSocial(p, { studio: accountFor(s), platforms: list, resolveLocal: localPathFor });
        console.log('[social] publish', s || '-', p.video ? 'video' : '', JSON.stringify(Object.fromEntries(
          Object.entries(results).map(([k, r]) => [k, r.ok ? r.url || r.id : `ERR ${r.error}`]),
        )));
        return results;
      };
      if (p.video) return res.json({ jobId: startJob(run) });   // reels/uploads outlast nginx's 60 s
      res.json(await run());
    } catch (e) { send(res, e); }
  });

  router.post('/video', (req, res) => {
    const busy = [...jobs.values()].filter(j => j.kind === 'video' && j.status === 'running').length;
    if (busy >= VIDEO_JOBS_AT_ONCE) return res.status(429).json({ error: 'Another video is being prepared. Try again in a minute.' });
    sweepVideos(VIDEO_KEEP_DAYS * 864e5).catch(() => {});
    videoUpload.single('video')(req, res, err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Video is over ${VIDEO_MAX_MB} MB.` : err.message });
      if (!req.file) return res.status(400).json({ error: 'Upload a video file (MP4 or MOV).' });
      const { fit, start, end } = req.body || {};
      const tmp = req.file.path;
      const jobId = startJob(() => prepareVideo(tmp, { fit, start, end })
        .finally(() => fs.promises.unlink(tmp).catch(() => {})), 'video');
      res.json({ jobId });
    });
  });

  router.get('/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found (finished over 2 hours ago, or the server restarted).' });
    res.json({ status: job.status, ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) });
  });

  return router;
};
