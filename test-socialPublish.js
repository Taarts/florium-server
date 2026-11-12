// Mocked end-to-end test — no real network calls.
const assert = require('assert');
const { publishToSocial } = require('./socialPublish');

const env = {
  FB_PAGE_ID: 'PAGE1', FB_PAGE_TOKEN: 'tok', IG_USER_ID: 'IG1',
  BSKY_HANDLE: 'studio.bsky.social', BSKY_APP_PASSWORD: 'xxxx-xxxx',
};

const calls = [];
let containerSeq = 0;
const json = (data, status = 200) => ({
  ok: status < 400, status, json: async () => data,
  headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(1000),
});

async function mockFetch(url, init = {}) {
  const method = init.method || 'GET';
  const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body;
  calls.push({ method, url, body });

  // images
  if (url.endsWith('.jpg')) return json({});
  // Bluesky
  if (url.includes('createSession')) return json({ accessJwt: 'A', refreshJwt: 'R', did: 'did:plc:abc', handle: 'studio.bsky.social' });
  if (url.includes('uploadBlob')) return json({ blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/jpeg', size: 1000 } });
  if (url.includes('createRecord')) return json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c1' });
  // Graph
  if (url.includes('/PAGE1/photos')) return json({ id: 'PHOTO' + calls.length, post_id: 'PAGE1_99' });
  if (url.includes('/PAGE1/feed')) return json({ id: 'PAGE1_100' });
  if (url.includes('/IG1/media_publish')) return json({ id: 'IGMEDIA1' });
  if (url.includes('/IG1/media')) return json({ id: 'CONT' + (++containerSeq) });
  if (url.includes('fields=status_code')) return json({ status_code: 'FINISHED' });
  if (url.includes('fields=permalink_url')) return json({ permalink_url: 'https://www.facebook.com/p/1' });
  if (url.includes('fields=permalink')) return json({ permalink: 'https://www.instagram.com/p/abc/' });
  if (url.includes('/comments')) return json({ id: 'COMMENT' });
  return json({ error: { message: 'unmocked ' + url } }, 400);
}

const post = {
  title: 'Saturday Workshop',
  body: '<p>Backbends &amp; shoulders.</p>',
  link: { url: 'https://iy-sp.com/?openWorkshop=abc' },
  images: [
    { url: 'https://iy-sp.com/uploads/a.jpg', alt: 'A', width: 1080, height: 1350, mimeType: 'image/jpeg' },
    { url: 'https://iy-sp.com/uploads/b.jpg', alt: 'B', width: 1080, height: 1350, mimeType: 'image/jpeg' },
  ],
  hashtags: ['yoga'],
  instagram: { hashtagsInFirstComment: true },
};

(async () => {
  const r = await publishToSocial(post, { env, fetch: mockFetch, igPollMs: 1 });
  console.log(JSON.stringify(r, null, 2));

  assert(r.facebook.ok && r.facebook.url === 'https://www.facebook.com/p/1');
  assert(r.instagram.ok && r.instagram.url === 'https://www.instagram.com/p/abc/');
  assert(r.bluesky.ok && r.bluesky.url === 'https://bsky.app/profile/studio.bsky.social/post/3kxyz');

  // Facebook multi-photo: 2 unpublished photos then feed with attached_media
  const fbPhotos = calls.filter(c => c.url.includes('/PAGE1/photos'));
  assert.equal(fbPhotos.length, 2);
  assert.equal(fbPhotos[0].body.published, 'false');
  const fbFeed = calls.find(c => c.url.includes('/PAGE1/feed'));
  assert.equal(JSON.parse(fbFeed.body.attached_media).length, 2);

  // Instagram carousel: 2 children + carousel container + publish + comment
  const igMedia = calls.filter(c => c.method === 'POST' && /\/IG1\/media$/.test(c.url));
  assert.equal(igMedia.length, 3);
  assert.equal(igMedia[2].body.media_type, 'CAROUSEL');
  assert.equal(igMedia[2].body.children, 'CONT1,CONT2');
  assert(calls.some(c => c.url.includes('/IGMEDIA1/comments')));

  // Bluesky: 2 blobs, record has both images filled
  const rec = JSON.parse(calls.find(c => c.url.includes('createRecord')).body);
  assert.equal(rec.repo, 'did:plc:abc');
  assert(rec.record.embed.images.every(i => i.image && i.image.ref.$link === 'bafy'));

  // Second run reuses the Bluesky session
  calls.length = 0;
  await publishToSocial(post, { env, fetch: mockFetch, igPollMs: 1, platforms: ['bluesky'] });
  assert(!calls.some(c => c.url.includes('createSession')));

  // Missing credentials + one platform failing doesn't stop the others
  const partial = await publishToSocial({ body: 'text only' }, { env: { BSKY_HANDLE: 'x', BSKY_APP_PASSWORD: 'y' }, fetch: mockFetch });
  assert(!partial.facebook.ok && /isn't connected/.test(partial.facebook.error));
  assert(!partial.instagram.ok && /at least one photo/.test(partial.instagram.error));
  assert(partial.bluesky.ok);

  // Graph error surfaces cleanly
  const errFetch = async (url, init) => url.includes('/PAGE1/feed')
    ? json({ error: { message: 'Invalid OAuth access token', code: 190 } }, 400)
    : mockFetch(url, init);
  const e = await publishToSocial({ body: 'hi' }, { env, fetch: errFetch, platforms: ['facebook'] });
  assert(/Invalid OAuth access token \(code 190\)/.test(e.facebook.error));

  // Per-studio accounts: flourish posts as flourish; iy-sp never falls back to unsuffixed/other keys
  const studioEnv = {
    BSKY_HANDLE: 'shouldnotbeused.bsky.social', BSKY_APP_PASSWORD: 'nope',
    BSKY_HANDLE_FLOURISH: 'flourishyoga.bsky.social', BSKY_APP_PASSWORD_FLOURISH: 'fff',
    BSKY_HANDLE_IY_SP: 'iyengaryogastpete.bsky.social', BSKY_APP_PASSWORD_IY_SP: 'iii',
  };
  calls.length = 0;
  const fl = await publishToSocial({ body: 'flourish news' }, { env: studioEnv, studio: 'flourish', fetch: mockFetch, platforms: ['bluesky'] });
  assert(fl.bluesky.ok);
  const login = calls.find(c => c.url.includes('createSession'));
  assert.equal(JSON.parse(login.body).identifier, 'flourishyoga.bsky.social');
  const noFb = await publishToSocial({ body: 'x' }, { env: studioEnv, studio: 'iy-sp', fetch: mockFetch, platforms: ['facebook'] });
  assert(/isn't connected for iy-sp/.test(noFb.facebook.error));
  const { connectedPlatforms } = require('./socialPublish');
  assert.equal(connectedPlatforms('iy-sp', studioEnv).bluesky, 'iyengaryogastpete.bsky.social');
  assert.equal(connectedPlatforms('flourish', { BSKY_HANDLE: 'a', BSKY_APP_PASSWORD: 'b' }).bluesky, false);

  // dryRun sends nothing
  calls.length = 0;
  const dry = await publishToSocial(post, { env, fetch: mockFetch, dryRun: true });
  assert(dry.facebook.dryRun && calls.length === 0);

  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
