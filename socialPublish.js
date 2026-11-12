// socialPublish.js — format a post (socialFormat.js) and publish it to Facebook, Instagram, Bluesky, YouTube.
// Node 18+ (global fetch). Credentials come from the studio server's .env.
// Each studio has its own accounts — keys carry the studio as a suffix
// (studio id upper-cased, "-" → "_": iy-sp → IY_SP, flourish → FLOURISH):
//
//   FB_PAGE_ID_<STUDIO>=          Facebook Page id
//   FB_PAGE_TOKEN_<STUDIO>=       long-lived Page access token (also used for Instagram)
//   IG_USER_ID_<STUDIO>=          Instagram Business/Creator account id linked to that Page
//   BSKY_HANDLE_<STUDIO>=         e.g. flourishyoga.bsky.social
//   BSKY_APP_PASSWORD_<STUDIO>=   Bluesky app password (not the account password)
//   YT_REFRESH_TOKEN_<STUDIO>=    YouTube channel OAuth refresh token (youtube-connect.js writes these)
//   YT_CHANNEL_ID_<STUDIO>=, YT_CHANNEL_TITLE_<STUDIO>=
//   YT_CLIENT_ID=, YT_CLIENT_SECRET=   Google OAuth client (Desktop app), shared
//   GRAPH_VERSION=v24.0           optional, shared
//   BSKY_SERVICE=https://bsky.social   optional, shared
//
// With no studio (single-studio server, e.g. florium-server) the unsuffixed keys are used:
// FB_PAGE_ID, FB_PAGE_TOKEN, IG_USER_ID, BSKY_HANDLE, BSKY_APP_PASSWORD, YT_REFRESH_TOKEN, YT_CHANNEL_TITLE.
// A studio never falls back to the unsuffixed keys, so one studio can't post as another.
//
// publishToSocial(post, { studio, platforms, dryRun, resolveLocal }) →
//   { facebook: { ok, id?, url?, error?, warnings }, instagram: {...}, bluesky: {...}, youtube: {...} }
// resolveLocal(url) → local file path for media on this server (read from disk instead of fetched).
// One platform failing never stops the others.

'use strict';

const fs = require('fs');
const { formatForSocial, defaultPlatforms } = require('./socialFormat');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const studioSuffix = studio => String(studio).toUpperCase().replace(/[^A-Z0-9]+/g, '_');

function configFor(env, studio) {
  const k = name => (studio ? env[`${name}_${studioSuffix(studio)}`] : env[name]);
  return {
    studio: studio || null,
    graph: `https://graph.facebook.com/${env.GRAPH_VERSION || 'v24.0'}`,
    fbPageId: k('FB_PAGE_ID'),
    fbToken: k('FB_PAGE_TOKEN'),
    igUserId: k('IG_USER_ID'),
    bskyService: (env.BSKY_SERVICE || 'https://bsky.social').replace(/\/$/, ''),
    bskyHandle: k('BSKY_HANDLE'),
    bskyPassword: k('BSKY_APP_PASSWORD'),
    ytClientId: env.YT_CLIENT_ID,
    ytClientSecret: env.YT_CLIENT_SECRET,
    ytRefreshToken: k('YT_REFRESH_TOKEN'),
    ytChannelTitle: k('YT_CHANNEL_TITLE'),
  };
}

function configured(platform, c) {
  if (platform === 'facebook') return !!(c.fbPageId && c.fbToken);
  if (platform === 'instagram') return !!(c.igUserId && c.fbToken);
  if (platform === 'bluesky') return !!(c.bskyHandle && c.bskyPassword);
  if (platform === 'youtube') return !!(c.ytClientId && c.ytClientSecret && c.ytRefreshToken);
  return false;
}

// ─── media (photos/videos) ───────────────────────────────────────────────────
// Our own files are read from disk; anything else is fetched.

async function openMedia(ctx, url) {
  const local = ctx.resolveLocal && ctx.resolveLocal(url);
  if (local) {
    const { size } = await fs.promises.stat(local);
    const stream = () => fs.createReadStream(local).on('error', () => {});   // fetch reports read errors; never crash the server
    return { size, init: () => ({ body: stream(), duplex: 'half' }) };
  }
  const res = await ctx.fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch ${url} (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { size: buf.length, type: res.headers.get('content-type'), init: () => ({ body: buf }) };
}

// ─── Meta Graph API (Facebook + Instagram) ───────────────────────────────────

async function graphPost(ctx, path, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  body.append('access_token', ctx.c.fbToken);
  const res = await ctx.fetch(`${ctx.c.graph}/${path}`, { method: 'POST', body });
  return graphJson(res, `POST ${path}`);
}

async function graphGet(ctx, path, fields) {
  const qs = new URLSearchParams({ fields, access_token: ctx.c.fbToken });
  const res = await ctx.fetch(`${ctx.c.graph}/${path}?${qs}`);
  return graphJson(res, `GET ${path}`);
}

async function graphJson(res, label) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const detail = e.error_user_msg || e.message || `HTTP ${res.status}`;
    throw new Error(`${label}: ${detail}${e.code ? ` (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : ''}`);
  }
  return data;
}

async function publishFacebook(ctx, payload) {
  const page = ctx.c.fbPageId;
  let id;

  if (payload.type === 'feed') {
    ({ id } = await graphPost(ctx, `${page}/feed`, payload.params));
  } else if (payload.type === 'photo') {
    const r = await graphPost(ctx, `${page}/photos`, payload.params);
    id = r.post_id || r.id;
  } else if (payload.type === 'photos') {
    const media = [];
    for (const p of payload.photos) {
      const r = await graphPost(ctx, `${page}/photos`, { url: p.url, published: false, alt_text_custom: p.alt });
      media.push({ media_fbid: r.id });
    }
    ({ id } = await graphPost(ctx, `${page}/feed`, { message: payload.message, attached_media: media }));
  } else if (payload.type === 'reel') {
    return publishFacebookReel(ctx, payload);
  } else {
    throw new Error(`Unknown Facebook payload type: ${payload.type}`);
  }

  let url = `https://www.facebook.com/${id}`;
  try { url = (await graphGet(ctx, id, 'permalink_url')).permalink_url || url; } catch { /* keep fallback */ }
  return { id, url };
}

// Reels: start → upload bytes to rupload → finish (Meta limit: 30 API reels per Page per 24 h)
async function publishFacebookReel(ctx, payload) {
  const page = ctx.c.fbPageId;
  const { video_id: videoId } = await graphPost(ctx, `${page}/video_reels`, { upload_phase: 'start' });
  if (!videoId) throw new Error('Facebook did not return a video id.');

  const media = await openMedia(ctx, payload.videoUrl);
  const version = ctx.c.graph.split('/').pop();
  const up = await ctx.fetch(`https://rupload.facebook.com/video-upload/${version}/${videoId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${ctx.c.fbToken}`, offset: '0', file_size: String(media.size), 'Content-Length': String(media.size) },
    ...media.init(),
  });
  await graphJson(up, 'Reel upload');

  await graphPost(ctx, `${page}/video_reels`, {
    upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: payload.description,
  });

  // Processing runs on Meta's side; report a failure if it shows up quickly.
  for (let i = 0; i < ctx.fbReelPollTries; i++) {
    const { status } = await graphGet(ctx, videoId, 'status');
    const vs = status && status.video_status;
    if (vs === 'error') {
      const why = ['uploading_phase', 'processing_phase', 'publishing_phase'].map(k => status[k]?.errors?.[0]?.message).find(Boolean);
      throw new Error(`Facebook couldn't process the reel${why ? `: ${why}` : '.'}`);
    }
    if (vs === 'ready' || status?.publishing_phase?.status === 'complete') break;
    await sleep(ctx.igPollMs);
  }
  return { id: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}

async function waitForContainer(ctx, containerId, tries = ctx.igPollTries) {
  for (let i = 0; i < tries; i++) {
    const { status_code } = await graphGet(ctx, containerId, 'status_code');
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Instagram container ${containerId} ${status_code}`);
    await sleep(ctx.igPollMs);
  }
  throw new Error(`Instagram container ${containerId} not ready after ${tries} checks`);
}

async function publishInstagram(ctx, payload) {
  const ig = ctx.c.igUserId;
  let creationId;

  if (payload.mediaType === 'IMAGE' || payload.mediaType === 'REELS') {
    const item = payload.items[0];
    ({ id: creationId } = await graphPost(ctx, `${ig}/media`, { ...item, caption: payload.caption }));
  } else {
    const children = [];
    for (const item of payload.items) {
      const { id } = await graphPost(ctx, `${ig}/media`, { ...item, is_carousel_item: true });
      await waitForContainer(ctx, id);
      children.push(id);
    }
    ({ id: creationId } = await graphPost(ctx, `${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: payload.caption }));
  }

  await waitForContainer(ctx, creationId, payload.mediaType === 'REELS' ? ctx.igVideoPollTries : ctx.igPollTries);
  const { id } = await graphPost(ctx, `${ig}/media_publish`, { creation_id: creationId });

  let url = null;
  try { url = (await graphGet(ctx, id, 'permalink')).permalink || null; } catch { /* optional */ }

  const out = { id, url };
  if (payload.firstComment) {
    try { await graphPost(ctx, `${id}/comments`, { message: payload.firstComment }); }
    catch (e) { out.warning = `Posted, but the hashtag comment failed: ${e.message}`; }
  }
  return out;
}

// ─── Bluesky (AT Protocol) ───────────────────────────────────────────────────

const bskySessions = new Map();   // handle → { accessJwt, refreshJwt, did, handle } — createSession is rate-limited (30 / 5 min)

async function xrpc(ctx, method, nsid, { body, json, headers = {}, auth = true, duplex } = {}) {
  const h = { ...headers };
  if (auth) h.Authorization = `Bearer ${ctx.bsky.accessJwt}`;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const res = await ctx.fetch(`${ctx.c.bskyService}/xrpc/${nsid}`, { method, headers: h, body, ...(duplex ? { duplex } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${nsid}: ${data.message || data.error || `HTTP ${res.status}`}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

async function bskyLogin(ctx, force = false) {
  const key = ctx.c.bskyHandle;
  const cached = bskySessions.get(key);
  if (cached && !force) { ctx.bsky = cached; return; }

  if (cached && force) {
    try {
      const res = await ctx.fetch(`${ctx.c.bskyService}/xrpc/com.atproto.server.refreshSession`, {
        method: 'POST', headers: { Authorization: `Bearer ${cached.refreshJwt}` },
      });
      if (res.ok) {
        const s = await res.json();
        ctx.bsky = { accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did, handle: s.handle };
        bskySessions.set(key, ctx.bsky);
        return;
      }
    } catch { /* fall through to full login */ }
  }

  const s = await xrpc(ctx, 'POST', 'com.atproto.server.createSession', {
    auth: false, json: { identifier: ctx.c.bskyHandle, password: ctx.c.bskyPassword },
  });
  ctx.bsky = { accessJwt: s.accessJwt, refreshJwt: s.refreshJwt, did: s.did, handle: s.handle };
  bskySessions.set(key, ctx.bsky);
}

async function withBskyAuth(ctx, fn) {
  await bskyLogin(ctx);
  try { return await fn(); }
  catch (e) {
    if (e.code !== 'ExpiredToken' && e.code !== 'InvalidToken') throw e;
    await bskyLogin(ctx, true);
    return fn();
  }
}

async function uploadBlob(ctx, { url, mimeType, maxBytes = 2000000 }) {
  const media = await openMedia(ctx, url);
  const what = /^video\//.test(mimeType || '') ? 'Video' : 'Image';
  if (media.size > maxBytes) throw new Error(`${what} ${url} is ${(media.size / 1e6).toFixed(1)} MB; Bluesky allows ${maxBytes / 1e6} MB`);
  const type = mimeType || media.type || 'image/jpeg';
  // init() each call: a stream can only be sent once (withBskyAuth may retry)
  const { blob } = await xrpc(ctx, 'POST', 'com.atproto.repo.uploadBlob', {
    ...media.init(), headers: { 'Content-Type': type, 'Content-Length': String(media.size) },
  });
  return blob;
}

async function publishBluesky(ctx, payload) {
  const record = JSON.parse(JSON.stringify(payload.record));
  record.createdAt = new Date().toISOString();

  return withBskyAuth(ctx, async () => {
    for (const b of payload.blobsToUpload) {
      const blob = await uploadBlob(ctx, b);
      if (b.target === 'external.thumb') {
        record.embed.external.thumb = blob;
      } else if (b.target === 'video') {
        record.embed.video = blob;
      } else {
        const i = Number(b.target.split('.')[1]);
        record.embed.images[i].image = blob;
      }
    }
    const { uri, cid } = await xrpc(ctx, 'POST', 'com.atproto.repo.createRecord', {
      json: { repo: ctx.bsky.did, collection: 'app.bsky.feed.post', record },
    });
    const rkey = uri.split('/').pop();
    return { id: uri, cid, url: `https://bsky.app/profile/${ctx.bsky.handle}/post/${rkey}` };
  });
}

// ─── YouTube (Data API v3) ───────────────────────────────────────────────────

const ytTokens = new Map();   // refresh token → { token, expires }

async function ytAccessToken(ctx) {
  const cached = ytTokens.get(ctx.c.ytRefreshToken);
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  const res = await ctx.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: ctx.c.ytClientId, client_secret: ctx.c.ytClientSecret,
      refresh_token: ctx.c.ytRefreshToken, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const why = data.error === 'invalid_grant'
      ? 'YouTube sign-in expired or was revoked — rerun youtube-connect.js'
      : data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`YouTube token: ${why}`);
  }
  ytTokens.set(ctx.c.ytRefreshToken, { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

async function ytError(res, label) {
  const data = await res.json().catch(() => ({}));
  const e = data.error || {};
  const reason = e.errors && e.errors[0] && e.errors[0].reason;
  return new Error(`${label}: ${e.message || `HTTP ${res.status}`}${reason ? ` (${reason})` : ''}`);
}

async function publishYouTube(ctx, payload) {
  const token = await ytAccessToken(ctx);
  const media = await openMedia(ctx, payload.videoUrl);

  const init = await ctx.fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(media.size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(payload.resource),
  });
  if (!init.ok) throw await ytError(init, 'YouTube upload start');
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube upload start: no upload URL returned');

  const put = await ctx.fetch(location, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(media.size) },
    ...media.init(),
  });
  if (!put.ok) throw await ytError(put, 'YouTube upload');
  const video = await put.json();

  const out = { id: video.id, url: payload.isShort ? `https://www.youtube.com/shorts/${video.id}` : `https://youtu.be/${video.id}` };
  const asked = payload.resource.status.privacyStatus;
  const got = video.status && video.status.privacyStatus;
  if (got && got !== asked) out.warning = `YouTube set this video to ${got} (asked for ${asked}). Check it in YouTube Studio.`;
  return out;
}

// ─── entry point ─────────────────────────────────────────────────────────────

const PUBLISHERS = { facebook: publishFacebook, instagram: publishInstagram, bluesky: publishBluesky, youtube: publishYouTube };

async function publishToSocial(post, opts = {}) {
  const c = configFor(opts.env || process.env, opts.studio);
  const platforms = opts.platforms || defaultPlatforms(post);
  const formatted = formatForSocial(post, platforms);
  const ctx = {
    c,
    fetch: opts.fetch || globalThis.fetch,
    resolveLocal: opts.resolveLocal || null,
    igPollTries: opts.igPollTries ?? 20,
    igVideoPollTries: opts.igVideoPollTries ?? 120,   // reels: up to ~6 min at 3 s
    fbReelPollTries: opts.fbReelPollTries ?? 10,
    igPollMs: opts.igPollMs ?? 3000,
  };
  if (!ctx.fetch) throw new Error('No fetch available — needs Node 18+');

  const entries = await Promise.all(platforms.map(async p => {
    const f = formatted[p];
    const base = { warnings: f.warnings };
    if (!f.ok) return [p, { ...base, ok: false, error: f.errors.join(' ') }];
    if (!configured(p, c)) return [p, { ...base, ok: false, error: `${p} isn't connected${c.studio ? ` for ${c.studio}` : ''} (missing credentials in .env).` }];
    if (opts.dryRun) return [p, { ...base, ok: true, dryRun: true, payload: f.payload }];
    try {
      const r = await PUBLISHERS[p]({ ...ctx }, f.payload);
      if (r.warning) base.warnings = [...base.warnings, r.warning];
      return [p, { ...base, ok: true, id: r.id, url: r.url }];
    } catch (e) {
      return [p, { ...base, ok: false, error: e.message }];
    }
  }));

  return Object.fromEntries(entries);
}

function connectedPlatforms(studio, env = process.env) {
  const c = configFor(env, studio);
  return Object.fromEntries(Object.keys(PUBLISHERS).map(p => [
    p, configured(p, c) ? (p === 'bluesky' ? c.bskyHandle : p === 'youtube' ? c.ytChannelTitle || true : true) : false,
  ]));
}

module.exports = { publishToSocial, connectedPlatforms, formatForSocial, studioSuffix };
