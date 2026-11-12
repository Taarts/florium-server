// socialVideo.js — turn an uploaded clip into one MP4 that every platform accepts as a short:
// 1080×1920 (9:16), H.264 High / yuv420p, closed GOP, AAC 48 kHz stereo, faststart, 24–30 fps.
// Needs ffmpeg + ffprobe on the server (apt install ffmpeg).
//
// probeVideo(path) → { duration, width, height, fps, hasAudio }   (width/height after rotation)
// prepareVideo(inputPath, { fit, start, end }) → video object, ready to use as post.video:
//   { file, url, poster, duration, width, height, bytes, mimeType: 'video/mp4' }
//   fit   'blur' (default) — whole frame kept, blurred copy fills the rest of 9:16
//         'crop'           — centre-cropped to fill 9:16
//   start, end   optional trim, in seconds
// localPathFor(url) → absolute path when url is one of our saved videos/posters, else null
//
// Files: uploads/social/videos/<24hex>.mp4 + <24hex>.jpg, served publicly at /api/social/videos/<file>
// (Instagram and Facebook fetch from there).

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const OUT_W = 1080, OUT_H = 1920;
const MAX_SECONDS = 600;                 // Bluesky's cap (10 min); Instagram's API allows 15, Facebook Reels 90
const VIDEO_DIR = process.env.SOCIAL_VIDEO_DIR || path.join(__dirname, 'uploads', 'social', 'videos');
const VIDEO_BASE = (process.env.PUBLIC_API_URL || 'https://iy-sp.com/api').replace(/\/$/, '') + '/social/videos';
const VIDEO_FILE_RE = /^[a-f0-9]{24}\.(mp4|jpg)$/;
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function run(cmd, args, { timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err = (err + d).slice(-4000); });
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    p.on('error', e => { clearTimeout(t); reject(e.code === 'ENOENT' ? new Error(`${cmd} isn't installed on the server (apt install ffmpeg)`) : e); });
    p.on('close', code => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} failed: ${err.trim().split('\n').slice(-3).join(' ')}`));
    });
  });
}

async function probeVideo(file) {
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60000 });
  const info = JSON.parse(out);
  const v = (info.streams || []).find(s => s.codec_type === 'video');
  if (!v) throw new Error("That file doesn't contain a video.");
  const rot = Math.abs(Number(
    v.tags?.rotate ?? (v.side_data_list || []).find(d => d.rotation !== undefined)?.rotation ?? 0,
  )) % 180;
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
  return {
    duration: Number(info.format?.duration || v.duration || 0),
    width: rot === 90 ? v.height : v.width,
    height: rot === 90 ? v.width : v.height,
    fps: d ? n / d : 30,
    hasAudio: (info.streams || []).some(s => s.codec_type === 'audio'),
  };
}

const num = x => (x === undefined || x === null || x === '' ? null : Number(x));

async function prepareVideo(input, opts = {}) {
  const src = await probeVideo(input);
  if (!src.duration) throw new Error("Couldn't read the video's length.");

  const start = Math.max(0, num(opts.start) || 0);
  const end = num(opts.end) ? Math.min(num(opts.end), src.duration) : src.duration;
  if (end <= start) throw new Error('Trim end must be after the start.');
  const length = end - start;
  if (length < 3) throw new Error('The clip has to be at least 3 seconds long.');
  if (length > MAX_SECONDS) throw new Error(`The clip is ${Math.round(length)} s; trim it to ${MAX_SECONDS / 60} minutes or less.`);

  const fps = Math.min(30, Math.max(24, Math.round(src.fps || 30)));
  const ratio = src.width / src.height;
  const vertical = Math.abs(ratio - OUT_W / OUT_H) < 0.03;
  const fit = opts.fit === 'crop' || vertical ? 'crop' : 'blur';

  const cover = `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H}`;
  const tail = `fps=${fps},format=yuv420p,setsar=1`;
  const graph = fit === 'crop'
    ? `[0:v]${cover},${tail}[v]`
    : `[0:v]split=2[bg][fg];[bg]${cover},boxblur=24:2,eq=brightness=-0.06[b];` +
      `[fg]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease[f];` +
      `[b][f]overlay=(W-w)/2:(H-h)/2,${tail}[v]`;

  await fs.promises.mkdir(VIDEO_DIR, { recursive: true });
  const id = crypto.randomBytes(12).toString('hex');
  const mp4 = path.join(VIDEO_DIR, `${id}.mp4`);
  const jpg = path.join(VIDEO_DIR, `${id}.jpg`);

  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (start) args.push('-ss', String(start));
  args.push('-i', input);
  if (!src.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');   // some apps reject silent files
  args.push(
    '-t', String(length),
    '-filter_complex', graph, '-map', '[v]', '-map', src.hasAudio ? '0:a:0' : '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.1',
    '-crf', '21', '-maxrate', '4M', '-bufsize', '8M',
    '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0', '-flags', '+cgop',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', '-shortest', mp4,
  );
  try {
    await run(FFMPEG, args);
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(1, length / 2)), '-i', mp4,
      '-frames:v', '1', '-q:v', '3', jpg], { timeoutMs: 60000 });
  } catch (e) {
    fs.promises.unlink(mp4).catch(() => {});
    fs.promises.unlink(jpg).catch(() => {});
    throw e;
  }

  const out = await probeVideo(mp4);
  const { size } = await fs.promises.stat(mp4);
  return {
    file: `${id}.mp4`,
    url: `${VIDEO_BASE}/${id}.mp4`,
    poster: `${VIDEO_BASE}/${id}.jpg`,
    duration: Math.round(out.duration * 10) / 10,
    width: out.width,
    height: out.height,
    bytes: size,
    mimeType: 'video/mp4',
    fit,
    source: { width: src.width, height: src.height, duration: Math.round(src.duration * 10) / 10 },
  };
}

// Delete prepared videos/posters older than maxAgeMs (the platforms keep their own copies).
async function sweepVideos(maxAgeMs) {
  let names;
  try { names = await fs.promises.readdir(VIDEO_DIR); } catch { return 0; }
  const cutoff = Date.now() - maxAgeMs;
  let n = 0;
  for (const f of names) {
    if (!VIDEO_FILE_RE.test(f)) continue;
    const full = path.join(VIDEO_DIR, f);
    try {
      if ((await fs.promises.stat(full)).mtimeMs < cutoff) { await fs.promises.unlink(full); n++; }
    } catch { /* gone already */ }
  }
  return n;
}

function localPathFor(url) {
  if (typeof url !== 'string' || !url.startsWith(VIDEO_BASE + '/')) return null;
  const file = url.slice(VIDEO_BASE.length + 1);
  return VIDEO_FILE_RE.test(file) ? path.join(VIDEO_DIR, file) : null;
}

module.exports = { probeVideo, prepareVideo, localPathFor, sweepVideos, VIDEO_DIR, VIDEO_BASE, VIDEO_FILE_RE, MAX_SECONDS };
