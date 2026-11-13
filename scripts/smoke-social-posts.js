// Smoke test: Social saved posts (teacher draft → submit → owner return → delete). Posts nothing.
// Run on the VPS:  cd /var/www/iy-sp-server && node scripts/smoke-social-posts.js
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SocialPost = require('../models/SocialPost');
const { STUDIOS = [] } = require('../config/studio');

const BASE = `http://127.0.0.1:${process.env.PORT || 5000}/api/social`;
const tokenFor = u => jwt.sign({ sub: String(u._id), role: u.role, tv: u.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });
let failed = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function call(token, method, url, body) {
  const r = await fetch(BASE + url, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let d = {}; try { d = await r.json(); } catch { /* empty */ }
  return { status: r.status, d };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const owner = await User.findOne({ role: 'owner', active: true }).lean();
  const teacher = await User.findOne({ role: 'teacher', active: true }).lean();
  if (!owner || !teacher) { console.log('Need an active owner and teacher login — skipped.'); process.exit(0); }
  const studio = (teacher.studios && teacher.studios[0]) || STUDIOS[0] || null;
  console.log(`owner ${owner.email} · teacher ${teacher.email} · studio ${studio}`);
  const T = tokenFor(teacher), O = tokenFor(owner);
  let id;
  try {
    let r = await call(T, 'GET', '/status');
    check(r.status === 200, 'teacher can open the Social tab (status)', `HTTP ${r.status}`);

    r = await call(T, 'POST', '/publish', { studio });          // no `post`: even if auth were wrong nothing is sent
    check(r.status === 403, 'teacher cannot publish', `HTTP ${r.status}`);

    r = await call(T, 'POST', '/posts', { studio, form: { body: 'SMOKE TEST — delete me' } });
    id = r.d.post && r.d.post._id;
    check(r.status === 201 && r.d.post.status === 'draft', 'teacher saves a draft', `HTTP ${r.status}`);

    const other = STUDIOS.find(s => !(teacher.studios || []).includes(s));
    if (STUDIOS.length > 1 && (teacher.studios || []).length && other) {
      r = await call(T, 'POST', '/posts', { studio: other, form: { body: 'x' } });
      check(r.status === 403, `teacher cannot write for ${other}`, `HTTP ${r.status}`);
    }

    r = await call(T, 'POST', `/posts/${id}/submit`);
    check(r.status === 200 && r.d.post.status === 'submitted', 'teacher submits for approval', `HTTP ${r.status}`);

    r = await call(T, 'PUT', `/posts/${id}`, { form: { body: 'changed' } });
    check(r.status === 409, 'teacher cannot edit while submitted', `HTTP ${r.status}`);

    r = await call(O, 'GET', `/posts?studio=${encodeURIComponent(studio || '')}`);
    const first = (r.d.posts || [])[0];
    check(r.status === 200 && first && String(first._id) === String(id), 'owner sees it first in the list', `HTTP ${r.status}`);

    r = await call(O, 'POST', `/posts/${id}/return`, { note: 'smoke note' });
    check(r.status === 200 && r.d.post.status === 'draft' && r.d.post.reviewNote === 'smoke note', 'owner returns it with a note', `HTTP ${r.status}`);

    r = await call(T, 'GET', `/posts/${id}`);
    check(r.status === 200 && r.d.post.reviewNote === 'smoke note', 'teacher sees the note', `HTTP ${r.status}`);

    r = await call(T, 'DELETE', `/posts/${id}`);
    check(r.status === 200, 'teacher deletes the draft', `HTTP ${r.status}`);
    id = null;
  } finally {
    if (id) await SocialPost.deleteOne({ _id: id });
    await mongoose.disconnect();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
