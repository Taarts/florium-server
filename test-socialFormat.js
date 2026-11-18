const assert = require('assert');
const { formatForSocial } = require('./socialFormat');

const post = {
  title: 'Saturday Backbends Workshop ✨',
  body: '<p>Join us for a <strong>2-hour</strong> workshop on backbends &amp; shoulder opening.</p><ul><li>All levels</li><li>Props provided</li></ul><p>Details on <a href="https://iy-sp.com/workshops">our site</a>.</p>',
  link: { url: 'https://iy-sp.com/?openWorkshop=abc123', title: 'Backbends Workshop' },
  images: [{ url: 'https://iy-sp.com/uploads/newsletter/bb.jpg', alt: 'Student in Urdhva Dhanurasana', width: 1080, height: 1350, bytes: 400000, mimeType: 'image/jpeg' }],
  hashtags: ['iyengaryoga', '#StPete', 'yoga', 'stpete'],
};

const r = formatForSocial(post);
console.log(JSON.stringify(r, null, 2));

// Facebook
assert(r.facebook.ok);
assert.equal(r.facebook.payload.type, 'photo');
assert(r.facebook.payload.params.caption.includes('https://iy-sp.com/?openWorkshop=abc123'));
assert(r.facebook.payload.params.caption.includes('our site (https://iy-sp.com/workshops)'));

// Instagram
assert(r.instagram.ok);
assert(!/https?:\/\//.test(r.instagram.payload.caption));
assert(r.instagram.payload.caption.includes('#iyengaryoga #StPete #yoga'));

// Bluesky
const b = r.bluesky.payload.record;
assert(r.bluesky.ok);
const g = [...new Intl.Segmenter().segment(b.text)].length;
assert(g <= 300, 'graphemes ' + g);
const buf = Buffer.from(b.text, 'utf8');
for (const f of b.facets) {
  const s = buf.slice(f.index.byteStart, f.index.byteEnd).toString('utf8');
  const feat = f.features[0];
  if (feat.$type.endsWith('#tag')) assert.equal(s, '#' + feat.tag);
  else assert(s.length > 0 && feat.uri.startsWith('https://'), s);
}
assert.equal(r.bluesky.payload.blobsToUpload.length, 1);

// Long text → truncation; no image → IG error, FB feed+link, Bluesky external card
const long = formatForSocial({ body: 'word '.repeat(800), link: { url: 'https://iy-sp.com/x' }, hashtags: ['a1'] });
assert(!long.instagram.ok);
assert.equal(long.facebook.payload.type, 'feed');
assert.equal(long.facebook.payload.params.link, 'https://iy-sp.com/x');
assert.equal(long.bluesky.payload.record.embed.$type, 'app.bsky.embed.external');
assert([...new Intl.Segmenter().segment(long.bluesky.payload.record.text)].length <= 300);
assert(long.bluesky.payload.record.text.endsWith('#a1'));

// Bad IG ratio + png
const bad = formatForSocial({ body: 'hi', images: [{ url: 'x.png', width: 3000, height: 1000 }] }, ['instagram']);
assert.equal(bad.instagram.errors.length, 2);

// Link words: [Sign up](url) in the body, link.text for the booking link
{
  const url = 'https://iy-sp.com/?openWorkshop=abc123';
  const img = { url: 'https://iy-sp.com/a.jpg', alt: 'a', width: 1080, height: 1350, mimeType: 'image/jpeg' };
  const enc = new TextEncoder();
  const facetText = (rec, f) => new TextDecoder().decode(enc.encode(rec.text).slice(f.index.byteStart, f.index.byteEnd));

  // Bluesky with a photo: link.text becomes the clickable words, no URL shown
  const a = formatForSocial({ body: 'Backbends this Saturday. #yoga', link: { url, text: 'Sign up' }, images: [img] });
  const ra = a.bluesky.payload.record;
  assert(ra.text.includes('Sign up') && !ra.text.includes('iy-sp.com'), ra.text);
  const fa = ra.facets.find(f => f.features[0].uri === url);
  assert.equal(facetText(ra, fa), 'Sign up');
  assert(ra.facets.some(f => f.features[0].tag === 'yoga'));
  assert(a.facebook.payload.params.caption.includes(`Sign up: ${url}`));
  assert(a.instagram.payload.caption.includes('Sign up — link in bio'));
  assert(!a.instagram.payload.caption.includes('iy-sp.com'));

  // Markdown link in the body, mid-sentence, with an emoji before it (byte offsets)
  const b = formatForSocial({ body: '✨ New workshop! [Click here](https://iy-sp.com/w) to book.', images: [img] }, ['bluesky', 'facebook', 'instagram']);
  const rb = b.bluesky.payload.record;
  assert.equal(rb.text, '✨ New workshop! Click here to book.');
  assert.equal(facetText(rb, rb.facets[0]), 'Click here');
  assert.equal(rb.facets[0].features[0].uri, 'https://iy-sp.com/w');
  assert(b.facebook.payload.params.caption.includes('Click here (https://iy-sp.com/w) to book.'));
  assert(b.instagram.payload.caption.includes('Click here to book.'));
  assert(b.instagram.payload.caption.includes('Link in bio'));          // body link, no booking link
  const plainIg = formatForSocial({ body: 'No links here.', images: [img] }, ['instagram']);
  assert(!plainIg.instagram.payload.caption.includes('bio'));
  const customIg = formatForSocial({ body: 'x', link: { url }, instagram: { linkLine: '' }, images: [img] }, ['instagram']);
  assert.equal(customIg.instagram.payload.caption, 'x');

  // Link card (no photos): Facebook drops the URL and the markdown, keeps the words
  const c = formatForSocial({ body: 'Spots left — [Sign up](' + url + ') today. ' + url, link: { url, text: 'Sign up' } }, ['facebook', 'bluesky']);
  assert.equal(c.facebook.payload.type, 'feed');
  assert.equal(c.facebook.payload.params.message, 'Spots left — Sign up today.');
  const rc = c.bluesky.payload.record;
  assert.equal(rc.embed.$type, 'app.bsky.embed.external');
  assert.equal(rc.text, 'Spots left — Sign up today.');
  assert.equal(facetText(rc, rc.facets[0]), 'Sign up');

  // No private-use marker chars ever reach the post
  for (const r of [ra, rb, rc]) assert(!/[-]/.test(r.text));

  // Truncation that cuts through linked words: no broken facet, no markers
  const d = formatForSocial({ body: 'word '.repeat(70) + '[Sign up for the long weekend intensive](https://iy-sp.com/x)', images: [img] }, ['bluesky']);
  const rd = d.bluesky.payload.record;
  assert(!/[-]/.test(rd.text));
  assert([...new Intl.Segmenter().segment(rd.text)].length <= 300);
  for (const f of rd.facets || []) assert(f.index.byteEnd <= enc.encode(rd.text).length);

  // YouTube description label
  const y = formatForSocial({ title: 'T', body: 'b', link: { url, text: 'Book now' }, video: { url: 'https://x/v.mp4', duration: 20, width: 1080, height: 1920 } }, ['youtube']);
  assert(y.youtube.payload.resource.snippet.description.includes(`Book now: ${url}`));
}

console.log('\nALL PASS');
