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

console.log('\nALL PASS');
