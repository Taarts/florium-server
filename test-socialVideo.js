// Mocked video-post test — no real network calls. Run: node test-socialVideo.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { publishToSocial } = require('./socialPublish');
const { formatForSocial } = require('./socialFormat');

const env = {
  FB_PAGE_ID_IY_SP: 'PAGE1', FB_PAGE_TOKEN_IY_SP: 'tok', IG_USER_ID_IY_SP: 'IG1',
  BSKY_HANDLE_IY_SP: 'studio.bsky.social', BSKY_APP_PASSWORD_IY_SP: 'xxxx',
  YT_CLIENT_ID: 'cid', YT_CLIENT_SECRET: 'csec', YT_REFRESH_TOKEN_IY_SP: 'rt', YT_CHANNEL_TITLE_IY_SP: 'IY-SP',
  GRAPH_VERSION: 'v27.0',
};

const tmp = path.join(os.tmpdir(), 'sv-test.mp4');
fs.writeFileSync(tmp, Buffer.alloc(123456, 1));
const VURL = 'https://iy-sp.com/api/social/videos/aaaaaaaaaaaaaaaaaaaaaaaa.mp4';

const calls = [];
const res = (data, status = 200, headers = {}) => ({
  ok: status < 400, status, json: async () => data,
  headers: { get: k => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => new ArrayBuffer(10),
});

async function drain(body) {
  if (!body || typeof body === 'string' || body instanceof URLSearchParams || Buffer.isBuffer(body)) return body;
  let n = 0; for await (const c of body) n += c.length; return n;   // stream → byte count
}

async function mockFetch(url, init = {}) {
  const method = init.method || 'GET';
  let body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : await drain(init.body);
  calls.push({ method, url, body, headers: init.headers || {} });

  if (url.includes('oauth2.googleapis.com/token')) return res({ access_token: 'yt-access', expires_in: 3600 });
  if (url.includes('/upload/youtube/v3/videos')) return res({}, 200, { location: 'https://upload.example/session1' });
  if (url === 'https://upload.example/session1') return res({ id: 'YTID', status: { privacyStatus: 'public' } });

  if (url.includes('createSession')) return res({ accessJwt: 'A', refreshJwt: 'R', did: 'did:plc:abc', handle: 'studio.bsky.social' });
  if (url.includes('uploadBlob')) return res({ blob: { $type: 'blob', ref: { $link: 'bafyvid' }, mimeType: 'video/mp4', size: 123456 } });
  if (url.includes('createRecord')) return res({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kvid', cid: 'c1' });

  if (url.includes('/PAGE1/video_reels')) return res(body.upload_phase === 'start' ? { video_id: 'REEL1', upload_url: 'x' } : { success: true });
  if (url.includes('rupload.facebook.com/video-upload/v27.0/REEL1')) return res({ success: true });
  if (url.includes('/REEL1?') && url.includes('fields=status')) return res({ status: { video_status: 'ready' } });
  if (url.includes('/IG1/media_publish')) return res({ id: 'IGREEL1' });
  if (url.includes('/IG1/media')) return res({ id: 'CONTV' });
  if (url.includes('fields=status_code')) return res({ status_code: 'FINISHED' });
  if (url.includes('fields=permalink')) return res({ permalink: 'https://www.instagram.com/reel/abc/' });
  return res({ error: { message: 'unmocked ' + url } }, 400);
}

const post = {
  body: 'Ten seconds of Trikonasana.\nCome try a class.',
  hashtags: ['iyengaryoga', 'stpete'],
  link: { url: 'https://iy-sp.com/?openClass=1' },
  images: [{ url: 'https://iy-sp.com/x.jpg', alt: 'x', width: 1080, height: 1350, mimeType: 'image/jpeg' }],
  video: { url: VURL, poster: VURL.replace('.mp4', '.jpg'), duration: 42, width: 1080, height: 1920, bytes: 123456, mimeType: 'video/mp4' },
  youtube: { title: 'Trikonasana in 40 seconds', privacy: 'public' },
};

(async () => {
  // ── formatting ──
  const f = formatForSocial(post);
  assert.deepStrictEqual(Object.keys(f), ['facebook', 'instagram', 'bluesky', 'youtube']);
  assert.strictEqual(f.facebook.payload.type, 'reel');
  assert.ok(f.facebook.payload.description.includes('https://iy-sp.com/?openClass=1'));
  assert.strictEqual(f.instagram.payload.mediaType, 'REELS');
  assert.strictEqual(f.instagram.payload.items[0].video_url, VURL);
  assert.strictEqual(f.bluesky.payload.record.embed.$type, 'app.bsky.embed.video');
  assert.strictEqual(f.bluesky.payload.blobsToUpload.length, 1);
  assert.ok(f.bluesky.payload.record.text.includes('iy-sp.com/?openClass'), 'link goes in Bluesky text');
  assert.strictEqual(f.youtube.payload.resource.snippet.title, 'Trikonasana in 40 seconds');
  assert.ok(f.youtube.payload.isShort);
  assert.ok(f.facebook.warnings.includes('Photos are left out of a video post.'));

  // no video → YouTube not a default platform; explicit → error
  assert.ok(!('youtube' in formatForSocial({ body: 'hi' })));
  assert.strictEqual(formatForSocial({ body: 'hi' }, ['youtube']).youtube.ok, false);

  // too long for Facebook Reels, fine for others, not a Short
  const long = formatForSocial({ ...post, video: { ...post.video, duration: 200 } });
  assert.strictEqual(long.facebook.ok, false);
  assert.ok(long.instagram.ok && long.bluesky.ok && long.youtube.ok);
  assert.ok(!long.youtube.payload.isShort);

  // landscape → Facebook refuses
  assert.strictEqual(formatForSocial({ ...post, video: { ...post.video, width: 1920, height: 1080 } }, ['facebook']).facebook.ok, false);

  // title falls back to the first line of text
  const noTitle = formatForSocial({ ...post, youtube: {} }, ['youtube']).youtube.payload.resource.snippet;
  assert.strictEqual(noTitle.title, 'Ten seconds of Trikonasana.');
  assert.ok(!noTitle.description.startsWith('Ten seconds'), 'first line not repeated in description');

  // ── publishing ──
  const r = await publishToSocial(post, {
    studio: 'iy-sp', env, fetch: mockFetch, igPollMs: 0,
    resolveLocal: u => (u === VURL ? tmp : null),
  });
  console.log(JSON.stringify(r, null, 2));
  for (const p of ['facebook', 'instagram', 'bluesky', 'youtube']) assert.ok(r[p].ok, `${p}: ${r[p].error}`);
  assert.strictEqual(r.facebook.url, 'https://www.facebook.com/reel/REEL1');
  assert.strictEqual(r.youtube.url, 'https://www.youtube.com/shorts/YTID');

  const rup = calls.find(c => c.url.includes('rupload'));
  assert.strictEqual(rup.body, 123456, 'reel bytes streamed from disk');
  assert.strictEqual(rup.headers.file_size, '123456');
  const blob = calls.find(c => c.url.includes('uploadBlob'));
  assert.strictEqual(blob.body, 123456);
  assert.strictEqual(blob.headers['Content-Type'], 'video/mp4');
  const rec = calls.find(c => c.url.includes('createRecord'));
  assert.strictEqual(JSON.parse(rec.body).record.embed.video.ref.$link, 'bafyvid');
  const ytPut = calls.find(c => c.url === 'https://upload.example/session1');
  assert.strictEqual(ytPut.body, 123456);
  const ytInit = calls.find(c => c.url.includes('/upload/youtube/v3/videos'));
  assert.strictEqual(JSON.parse(ytInit.body).status.privacyStatus, 'public');
  const igCont = calls.find(c => c.url.endsWith('/IG1/media'));
  assert.strictEqual(igCont.body.media_type, 'REELS');
  assert.strictEqual(igCont.body.video_url, VURL);

  // privacy downgrade is reported
  const calls2 = [];
  const r2 = await publishToSocial({ ...post, youtube: { title: 't', privacy: 'unlisted' } }, {
    studio: 'iy-sp', env, platforms: ['youtube'], resolveLocal: () => tmp,
    fetch: async (u, i) => { calls2.push(u); if (u.startsWith('https://upload.example')) { await drain(i.body); return res({ id: 'Y2', status: { privacyStatus: 'private' } }); } return mockFetch(u, i); },
  });
  assert.ok(r2.youtube.ok && r2.youtube.warnings.some(w => w.includes('set this video to private')));

  // not connected
  const r3 = await publishToSocial(post, { studio: 'flourish', env, platforms: ['youtube'], fetch: mockFetch });
  assert.ok(!r3.youtube.ok && /isn't connected/.test(r3.youtube.error));

  fs.unlinkSync(tmp);
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
