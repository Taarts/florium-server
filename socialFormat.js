// socialFormat.js — turn one app-built post into Facebook / Instagram / Bluesky payloads.
// Pure formatting: no network calls. A publisher module takes `payload` and posts it.
//
// Input post:
// {
//   title?:    'Saturday Workshop',
//   body:      'plain text' | '<p>html from the editor</p>',
//   link?:     { url, title?, description?, imageUrl? },   // booking deep link etc.
//   images?:   [{ url, alt?, width?, height?, bytes?, mimeType? }],  // public URLs
//   hashtags?: ['yoga', '#stpete'],
//   instagram?: { linkLine?: 'Link in bio', hashtagsInFirstComment?: false },
//   langs?:    ['en'],
//   video?:    { url, poster?, duration, width, height, bytes, mimeType:'video/mp4', alt? },  // socialVideo.prepareVideo
//   youtube?:  { title?, privacy?: 'public'|'unlisted'|'private' },
// }
// A post with `video` goes out as a short: Facebook Reel, Instagram Reel, Bluesky video, YouTube Short.
// Photos are left out of a video post. YouTube only takes video posts.
//
// Output: { facebook: Result, instagram: Result, bluesky: Result, youtube: Result }
// Result = { ok: boolean, errors: string[], warnings: string[], payload: object|null }

'use strict';

const LIMITS = {
  facebook:  { text: 63206 },
  instagram: { text: 2200, hashtags: 30, mentions: 20, minItems: 1, maxItems: 10, minRatio: 0.8, maxRatio: 1.91 },
  bluesky:   { graphemes: 300, bytes: 3000, images: 4, imageBytes: 2000000, altGraphemes: 2000, tagGraphemes: 64 },
  youtube:   { title: 100, descriptionBytes: 5000, tagsChars: 500, shortSeconds: 180 },
  video: {
    facebook:  { minSec: 3, maxSec: 90 },                                   // Reels
    instagram: { minSec: 3, maxSec: 900, reelsTabSec: 90 },                 // Reels (API allows 15 min; Reels tab ≤ 90 s)
    bluesky:   { minSec: 1, maxSec: 600, bytes: 300000000 },
    youtube:   { minSec: 1 },
  },
};

// Video checks shared by every platform: length, shape. Returns [errors, warnings].
function checkVideo(platform, video) {
  const errors = [], warnings = [];
  const L = LIMITS.video[platform];
  const d = Number(video.duration) || 0;
  if (!video.url) errors.push('Video has no URL.');
  if (!d) warnings.push("Video length unknown, so it wasn't checked.");
  else {
    if (d < L.minSec) errors.push(`Video is ${d.toFixed(1)} s; the minimum is ${L.minSec} s.`);
    if (L.maxSec && d > L.maxSec) errors.push(`Video is ${Math.round(d)} s; ${platform === 'facebook' ? 'Facebook Reels' : platform} allow${platform === 'facebook' ? '' : 's'} ${L.maxSec} s. Trim it.`);
  }
  if (L.bytes && video.bytes > L.bytes) errors.push(`Video is ${(video.bytes / 1e6).toFixed(0)} MB; the limit is ${L.bytes / 1e6} MB.`);
  if (video.width && video.height && Math.abs(video.width / video.height - 9 / 16) > 0.02 && platform === 'facebook') {
    errors.push('Facebook Reels must be 9:16 (vertical).');
  }
  return [errors, warnings];
}

const ignoredPhotosWarning = post => ((post.images || []).length ? ['Photos are left out of a video post.'] : []);

// ─── text helpers ────────────────────────────────────────────────────────────

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('en', { granularity: 'grapheme' })
  : null;

function graphemes(str) {
  return segmenter ? Array.from(segmenter.segment(str), s => s.segment) : Array.from(str);
}
const graphemeLen = str => graphemes(str).length;
const byteLen = str => Buffer.byteLength(str, 'utf8');

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (named[n.toLowerCase()] ?? m));
}

// HTML (or plain text) → plain text. linkMode: 'inline' → "text (url)", 'text' → "text" only.
function toPlainText(input, linkMode = 'inline') {
  if (!input) return '';
  let s = String(input);
  if (!/<[a-z][\s\S]*>/i.test(s)) return tidy(s);

  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (linkMode === 'text') return text;
    const bare = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return !text || text === href || text === bare ? href : `${text} (${href})`;
  });
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(s));
}

function tidy(s) {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHashtags(tags = []) {
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const t = String(raw).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!t || /^\d+$/.test(t)) continue;           // all-digit tags don't link anywhere
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
const MENTION_RE = /(^|\s)@[\w.]+/g;

// Cut `text` so measure(text + tail) <= max. Breaks on a word, adds "…".
function fitWithTail(text, tail, max, measure) {
  if (measure(text + tail) <= max) return text;
  const g = graphemes(text);
  let lo = 0, hi = g.length;
  while (lo < hi) {                                 // longest prefix that fits
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(g.slice(0, mid).join('').trimEnd() + '…' + tail) <= max) lo = mid; else hi = mid - 1;
  }
  let cut = g.slice(0, lo).join('');
  const lastSpace = cut.search(/\s\S*$/);
  if (lastSpace > cut.length * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[\s.,;:!?–—-]+$/, '');
  return cut ? cut + '…' : '';
}

function joinParts(...parts) {
  return parts.filter(p => p && p.trim()).join('\n\n');
}

function shortUrl(url, max = 30) {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return bare.length <= max ? bare : bare.slice(0, max - 1) + '…';
}

function result(errors, warnings, payload) {
  return { ok: errors.length === 0, errors, warnings, payload: errors.length ? null : payload };
}

// ─── Facebook ────────────────────────────────────────────────────────────────
// Publisher:
//   type 'feed'   → POST /{page-id}/feed   { message, link? }
//   type 'photo'  → POST /{page-id}/photos { url, caption, alt_text_custom? }
//   type 'photos' → each photo: POST /{page-id}/photos { url, published:false } → id
//                   then POST /{page-id}/feed { message, attached_media:[{media_fbid:id}] }

//   type 'reel'   → POST /{page-id}/video_reels {upload_phase:start} → video_id
//                   upload bytes to rupload.facebook.com/video-upload/{v}/{video_id}
//                   POST /{page-id}/video_reels { upload_phase:finish, video_id, video_state:PUBLISHED, description }

function formatFacebook(post) {
  const errors = [], warnings = [];
  const body = toPlainText(post.body, 'inline');
  const tags = normalizeHashtags(post.hashtags).map(t => '#' + t).join(' ');
  const images = post.images || [];
  const link = post.link && post.link.url;

  if (post.video) {
    const [e, w] = checkVideo('facebook', post.video);
    const linkLine = link && !body.includes(link) ? link : '';
    const description = joinParts(post.title, body, linkLine, tags);
    if (description.length > LIMITS.facebook.text) e.push(`Text is ${description.length} characters; Facebook allows ${LIMITS.facebook.text}.`);
    return result(e, [...w, ...ignoredPhotosWarning(post)], { type: 'reel', videoUrl: post.video.url, description });
  }

  let message;
  let payload;

  if (images.length) {
    // Photo posts don't take a `link` param — the URL has to live in the text.
    const linkLine = link && !body.includes(link) ? link : '';
    message = joinParts(post.title, body, linkLine, tags);
    payload = images.length === 1
      ? { type: 'photo', params: { url: images[0].url, caption: message, ...(images[0].alt ? { alt_text_custom: images[0].alt } : {}) } }
      : { type: 'photos', message, photos: images.map(i => ({ url: i.url, alt: i.alt || '' })) };
  } else if (link) {
    // Facebook builds the preview card from `link`; keep the URL out of the text.
    message = joinParts(post.title, body.split(link).join('').trim(), tags);
    payload = { type: 'feed', params: { message, link } };
  } else {
    message = joinParts(post.title, body, tags);
    payload = { type: 'feed', params: { message } };
  }

  if (!message && !images.length && !link) errors.push('Post is empty.');
  if (message.length > LIMITS.facebook.text) errors.push(`Text is ${message.length} characters; Facebook allows ${LIMITS.facebook.text}.`);
  images.forEach((img, i) => { if (!img.alt) warnings.push(`Photo ${i + 1} has no alt text.`); });

  return result(errors, warnings, payload);
}

// ─── Instagram ───────────────────────────────────────────────────────────────
// Publisher (Graph API, Business/Creator account):
//   IMAGE:    POST /{ig-user-id}/media { image_url, caption, alt_text? } → creation_id
//   CAROUSEL: each item POST /{ig-user-id}/media { image_url, is_carousel_item:true, alt_text? }
//             then POST /{ig-user-id}/media { media_type:'CAROUSEL', children:[ids], caption }
//   REELS:    POST /{ig-user-id}/media { media_type:'REELS', video_url, share_to_feed, cover_url?, caption }
//   then      POST /{ig-user-id}/media_publish { creation_id }
//   firstComment (optional) → POST /{media-id}/comments { message }

function formatInstagram(post) {
  const errors = [], warnings = [];
  const L = LIMITS.instagram;
  const opts = post.instagram || {};
  const video = post.video || null;
  let images = video ? [] : post.images || [];

  if (video) {
    const [e, w] = checkVideo('instagram', video);
    errors.push(...e); warnings.push(...w, ...ignoredPhotosWarning(post));
    const VL = LIMITS.video.instagram;
    if (video.duration > VL.reelsTabSec) warnings.push(`Over ${VL.reelsTabSec} s: posts as a Reel but won't be shown in the Reels tab.`);
    if (video.width && video.height && Math.abs(video.width / video.height - 9 / 16) > 0.02) warnings.push('Not 9:16: Instagram may crop it and keep it out of the Reels tab.');
  }
  if (!video && images.length < L.minItems) errors.push('Instagram needs at least one photo or a video.');
  if (images.length > L.maxItems) {
    warnings.push(`Instagram carousels hold ${L.maxItems} photos; using the first ${L.maxItems}.`);
    images = images.slice(0, L.maxItems);
  }

  images.forEach((img, i) => {
    const n = `Photo ${i + 1}`;
    const mime = (img.mimeType || '').toLowerCase();
    const isJpeg = mime ? /jpe?g/.test(mime) : /\.jpe?g(\?|$)/i.test(img.url);
    if (!isJpeg) errors.push(`${n}: Instagram's API only accepts JPEG.`);
    if (img.width && img.height) {
      const r = img.width / img.height;
      if (r < L.minRatio || r > L.maxRatio) errors.push(`${n}: aspect ratio ${r.toFixed(2)} is outside Instagram's 4:5 to 1.91:1 range.`);
    } else {
      warnings.push(`${n}: no dimensions given, so the aspect ratio wasn't checked.`);
    }
    if (!img.alt) warnings.push(`${n} has no alt text.`);
  });

  if (images.length > 1 && images.every(i => i.width && i.height)) {
    const r0 = (images[0].width / images[0].height).toFixed(2);
    if (images.some(i => (i.width / i.height).toFixed(2) !== r0)) {
      warnings.push('Carousel photos have different shapes; Instagram crops them all to the first photo\'s shape.');
    }
  }

  // Links aren't clickable in captions: keep link text, drop URLs.
  let body = toPlainText(post.body, 'text').replace(URL_RE, '').replace(/\(\s*\)/g, '');
  body = tidy(body);

  const link = post.link && post.link.url;
  const linkLine = link ? (opts.linkLine ?? `Book: ${shortUrl(link)}`) : '';

  const inlineTags = (body.match(TAG_RE) || []).length;
  let tags = normalizeHashtags(post.hashtags);
  const room = Math.max(0, L.hashtags - inlineTags);
  if (tags.length > room) {
    warnings.push(`Instagram allows ${L.hashtags} hashtags; dropped ${tags.length - room}.`);
    tags = tags.slice(0, room);
  }
  const tagLine = tags.map(t => '#' + t).join(' ');

  const captionTags = opts.hashtagsInFirstComment ? '' : tagLine;
  const tail = joinParts('', linkLine, captionTags) ? '\n\n' + joinParts(linkLine, captionTags) : '';
  const head = joinParts(post.title, body);
  const fitted = fitWithTail(head, tail, L.text, s => s.length);
  if (fitted !== head) warnings.push(`Caption shortened to fit Instagram's ${L.text}-character limit.`);
  const caption = (fitted + tail).trim();

  if ((caption.match(MENTION_RE) || []).length > L.mentions) errors.push(`Instagram allows ${L.mentions} @mentions per caption.`);
  if (graphemeLen(caption.split('\n')[0]) > 125) warnings.push('Only the first ~125 characters show before "more".');

  if (video) {
    return result(errors, warnings, {
      mediaType: 'REELS',
      caption,
      items: [{ media_type: 'REELS', video_url: video.url, share_to_feed: true, ...(video.poster ? { cover_url: video.poster } : {}) }],
      ...(opts.hashtagsInFirstComment && tagLine ? { firstComment: tagLine } : {}),
    });
  }

  const payload = {
    mediaType: images.length > 1 ? 'CAROUSEL' : 'IMAGE',
    caption,
    items: images.map(i => ({ image_url: i.url, ...(i.alt ? { alt_text: i.alt } : {}) })),
    ...(opts.hashtagsInFirstComment && tagLine ? { firstComment: tagLine } : {}),
  };
  return result(errors, warnings, payload);
}

// ─── Bluesky ─────────────────────────────────────────────────────────────────
// Publisher (AT Protocol):
//   for each entry in blobsToUpload: fetch url → POST com.atproto.repo.uploadBlob (raw bytes)
//     → put returned `blob` at record.embed.images[target].image  (or record.embed.external.thumb)
//     (video: one blob → record.embed.video)
//   then POST com.atproto.repo.createRecord { repo: did, collection:'app.bsky.feed.post', record }
// @mentions stay plain text (a mention facet needs the handle resolved to a DID first).

function formatBluesky(post) {
  const errors = [], warnings = [];
  const L = LIMITS.bluesky;
  const video = post.video || null;
  let images = video ? [] : post.images || [];
  const link = post.link && post.link.url;

  if (video) {
    const [e, w] = checkVideo('bluesky', video);
    errors.push(...e); warnings.push(...w, ...ignoredPhotosWarning(post));
  }

  if (images.length > L.images) {
    warnings.push(`Bluesky holds ${L.images} photos; using the first ${L.images}.`);
    images = images.slice(0, L.images);
  }
  images.forEach((img, i) => {
    if (img.bytes && img.bytes > L.imageBytes) errors.push(`Photo ${i + 1} is ${(img.bytes / 1e6).toFixed(1)} MB; Bluesky allows 2 MB. Resize before upload.`);
    if (!img.alt) warnings.push(`Photo ${i + 1} has no alt text.`);
  });

  // Body URLs get displayed short; the facet carries the full URL.
  const linkTargets = [];                           // [{ display, uri }]
  const shorten = uri => { const display = shortUrl(uri, 26); linkTargets.push({ display, uri }); return display; };

  let body = toPlainText(post.body, 'inline').replace(URL_RE, shorten);

  // With photos the link must go in the text; without, it becomes a link card.
  const linkInText = link && (images.length > 0 || video) && !linkTargets.some(t => t.uri === link);
  const linkLine = linkInText ? shorten(link) : '';
  if (link && !images.length && !video) body = body.split(shortUrl(link, 26)).join('').trim();

  let tags = normalizeHashtags(post.hashtags).filter(t => graphemeLen(t) <= L.tagGraphemes);
  const measure = s => Math.max(graphemeLen(s) / L.graphemes, byteLen(s) / L.bytes) * L.graphemes;
  const max = L.graphemes;

  const buildTail = () => {
    const t = joinParts(linkLine, tags.map(x => '#' + x).join(' '));
    return t ? '\n\n' + t : '';
  };
  let tail = buildTail();
  while (tags.length && measure(tail) > max * 0.5) { tags.pop(); tail = buildTail(); }   // tags never eat more than half
  const head = joinParts(post.title, body);
  let fitted = fitWithTail(head, tail, max, measure);
  if (!fitted && head) { tags = []; tail = buildTail(); fitted = fitWithTail(head, tail, max, measure); }
  if (fitted !== head) warnings.push('Text shortened to fit Bluesky\'s 300-character limit.');
  const droppedTags = normalizeHashtags(post.hashtags).length - tags.length;
  if (droppedTags > 0) warnings.push(`Dropped ${droppedTags} hashtag(s) to make room.`);

  const text = (fitted + tail).trim();
  if (!text && !images.length && !link && !video) errors.push('Post is empty.');

  // Facets — UTF-8 byte offsets.
  const facets = [];
  const addFacet = (charStart, charEnd, feature) => {
    facets.push({
      index: { byteStart: byteLen(text.slice(0, charStart)), byteEnd: byteLen(text.slice(0, charEnd)) },
      features: [feature],
    });
  };
  let searchFrom = 0;
  for (const { display, uri } of linkTargets) {
    const at = text.indexOf(display, searchFrom);
    if (at === -1) continue;                        // truncated away
    addFacet(at, at + display.length, { $type: 'app.bsky.richtext.facet#link', uri });
    searchFrom = at + display.length;
  }
  for (const m of text.matchAll(TAG_RE)) {
    const start = m.index + m[1].length;
    addFacet(start, start + 1 + m[2].length, { $type: 'app.bsky.richtext.facet#tag', tag: m[2] });
  }
  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: post.langs || ['en'],
    ...(facets.length ? { facets } : {}),
  };
  const blobsToUpload = [];

  if (video) {
    record.embed = {
      $type: 'app.bsky.embed.video',
      video: null,                                  // ← uploadBlob result
      ...(video.alt ? { alt: video.alt } : {}),
      ...(video.width && video.height ? { aspectRatio: { width: video.width, height: video.height } } : {}),
    };
    blobsToUpload.push({ url: video.url, mimeType: 'video/mp4', target: 'video', maxBytes: LIMITS.video.bluesky.bytes });
  } else if (images.length) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: images.map((img, i) => {
        blobsToUpload.push({ url: img.url, mimeType: img.mimeType || 'image/jpeg', target: `images.${i}` });
        return {
          alt: graphemes(img.alt || '').slice(0, L.altGraphemes).join(''),
          image: null,                              // ← uploadBlob result
          ...(img.width && img.height ? { aspectRatio: { width: img.width, height: img.height } } : {}),
        };
      }),
    };
  } else if (link) {
    record.embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: link,
        title: post.link.title || post.title || shortUrl(link),
        description: post.link.description || '',
      },
    };
    if (post.link.imageUrl) blobsToUpload.push({ url: post.link.imageUrl, mimeType: 'image/jpeg', target: 'external.thumb' });
  }

  return result(errors, warnings, { record, blobsToUpload });
}

// ─── YouTube ─────────────────────────────────────────────────────────────────
// Publisher (Data API v3, OAuth refresh token for the channel):
//   POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
//        body = resource → Location; PUT the MP4 bytes to Location → video resource
// There is no "Short" flag: YouTube files a vertical/square video of ≤ 3 minutes under Shorts.

const YT_PRIVACY = ['public', 'unlisted', 'private'];
const noAngles = s => s.replace(/[<>]/g, '');

function formatYouTube(post) {
  const errors = [], warnings = [];
  const L = LIMITS.youtube;
  const video = post.video;
  const opts = post.youtube || {};
  if (!video) return result(['YouTube only takes video posts.'], [], null);

  const [e, w] = checkVideo('youtube', video);
  errors.push(...e); warnings.push(...w, ...ignoredPhotosWarning(post));

  const body = noAngles(toPlainText(post.body, 'inline'));
  const firstLine = body.split('\n').find(l => l.trim()) || '';
  let title = noAngles(String(opts.title || post.title || firstLine).replace(/\s+/g, ' ').trim());
  if (!title) errors.push('YouTube needs a title.');
  if (graphemeLen(title) > L.title) {
    title = fitWithTail(title, '', L.title, graphemeLen);
    warnings.push(`Title shortened to YouTube's ${L.title} characters.`);
  }

  const link = post.link && post.link.url;
  const tags = normalizeHashtags(post.hashtags);
  const linkLine = link && !body.includes(link) ? link : '';
  const tagLine = tags.map(t => '#' + t).join(' ');
  const head = opts.title || post.title ? body : body.split('\n').slice(body.split('\n').indexOf(firstLine) + 1).join('\n').trim();
  const tail = joinParts(linkLine, tagLine) ? '\n\n' + joinParts(linkLine, tagLine) : '';
  const description = (fitWithTail(head, tail, L.descriptionBytes, byteLen) + tail).trim();
  if (description !== (head + tail).trim()) warnings.push('Description shortened to fit YouTube\'s limit.');

  // API tags: total length (with commas) ≤ 500
  const apiTags = [];
  let used = 0;
  for (const t of tags) { if (used + t.length + 1 > L.tagsChars) break; apiTags.push(t); used += t.length + 1; }

  const privacy = YT_PRIVACY.includes(opts.privacy) ? opts.privacy : 'public';
  const d = Number(video.duration) || 0;
  const isShort = d > 0 && d <= L.shortSeconds && (!video.width || video.height >= video.width);
  if (!isShort) warnings.push(`Longer than ${L.shortSeconds / 60} minutes or landscape: YouTube will file it as a regular video, not a Short.`);
  if (privacy !== 'public') warnings.push(`Uploads as ${privacy}.`);

  return result(errors, warnings, {
    videoUrl: video.url,
    isShort,
    resource: {
      snippet: {
        title, description,
        ...(apiTags.length ? { tags: apiTags } : {}),
        categoryId: String(opts.categoryId || process.env.YT_CATEGORY_ID || '26'),   // 26 = Howto & Style
        defaultLanguage: (post.langs && post.langs[0]) || 'en',
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
    },
  });
}

// ─── entry point ─────────────────────────────────────────────────────────────

const FORMATTERS = { facebook: formatFacebook, instagram: formatInstagram, bluesky: formatBluesky, youtube: formatYouTube };

// Platforms used when the caller doesn't say: YouTube only for video posts.
const defaultPlatforms = post => Object.keys(FORMATTERS).filter(p => p !== 'youtube' || (post && post.video));

function formatForSocial(post, platforms = defaultPlatforms(post)) {
  const out = {};
  for (const p of platforms) {
    if (!FORMATTERS[p]) throw new Error(`Unknown platform: ${p}`);
    out[p] = FORMATTERS[p](post || {});
  }
  return out;
}

module.exports = { formatForSocial, defaultPlatforms, formatFacebook, formatInstagram, formatBluesky, formatYouTube, toPlainText, LIMITS };
