#!/usr/bin/env node
// youtube-connect.js — run ON THE VPS from /var/www/iy-sp-server
//   node youtube-connect.js iy-sp        (studio id; default iy-sp)
//   node youtube-connect.js single       (single-studio server, e.g. florium-server → unsuffixed keys)
//
// Connects a studio's YouTube channel for Social posting. Needs a Google Cloud OAuth client of
// type "Desktop app" (YouTube Data API v3 enabled). Prints a sign-in link; open it in your browser,
// pick the studio's channel, allow access. The browser then lands on a 127.0.0.1 page that won't
// load — copy that whole address from the address bar and paste it here.
//
// Writes to .env (backup first): YT_CLIENT_ID, YT_CLIENT_SECRET (shared),
//   YT_REFRESH_TOKEN_<STUDIO>, YT_CHANNEL_ID_<STUDIO>, YT_CHANNEL_TITLE_<STUDIO>
// Tokens are never printed in full.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ENV_PATH = path.join(process.cwd(), '.env');
const REDIRECT = 'http://127.0.0.1:8765';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',     // to read back which channel was picked
];

const studio = (process.argv[2] || 'iy-sp').toLowerCase();
const SUFFIX = studio === 'single' ? '' : studio.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const key = name => (SUFFIX ? `${name}_${SUFFIX}` : name);

const mask = t => (t ? t.slice(0, 6) + '…' + t.slice(-4) : '(none)');
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()); }));
}

function readEnv() {
  const lines = fs.readFileSync(ENV_PATH, 'utf8').replace(/\n+$/, '').split('\n');
  const get = key => {
    const l = lines.find(x => x.startsWith(key + '='));
    return l ? l.slice(key.length + 1).replace(/^"(.*)"$/, '$1') : '';
  };
  return { lines, get };
}

function setEnv(lines, key, value) {
  const v = /[\s#"']/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
  const i = lines.findIndex(l => l.startsWith(key + '='));
  if (i >= 0) lines[i] = `${key}=${v}`;
  else lines.push(`${key}=${v}`);
}

(async () => {
  if (!fs.existsSync(ENV_PATH)) throw new Error(`No .env at ${ENV_PATH} — cd /var/www/iy-sp-server first`);
  const { lines, get } = readEnv();

  console.log(`Connecting YouTube for ${SUFFIX ? `studio "${studio}" (keys *_${SUFFIX})` : 'this server (unsuffixed keys)'}\n`);
  const clientId = get('YT_CLIENT_ID') || await ask('Google OAuth Client ID: ');
  const clientSecret = get('YT_CLIENT_SECRET') || await ask('Google OAuth Client secret: ');
  if (get('YT_CLIENT_ID')) console.log(`Using YT_CLIENT_ID from .env (${mask(clientId)})`);

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  console.log('\n1. Open this link in Firefox (signed in to the Google account that manages the channel):\n');
  console.log(authUrl + '\n');
  console.log('2. Pick the studio\'s YouTube channel, then Continue / Allow.');
  console.log('   ("Google hasn\'t verified this app" → Advanced → Go to … (unsafe) is expected for your own app.)');
  console.log('3. The browser ends on 127.0.0.1:8765 and says it can\'t connect. That\'s expected.\n');
  const pasted = await ask('Paste the full address from the address bar: ');

  let u;
  try { u = new URL(pasted); } catch { throw new Error('That isn\'t a URL — copy the whole address starting with http://127.0.0.1:8765/'); }
  if (u.searchParams.get('error')) throw new Error(`Google said: ${u.searchParams.get('error')}`);
  if (u.searchParams.get('state') !== state) throw new Error('State mismatch — run the script again and use the new link');
  const code = u.searchParams.get('code');
  if (!code) throw new Error('No code in that address');

  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const tok = await tokRes.json();
  if (!tokRes.ok) throw new Error(`Token exchange: ${tok.error_description || tok.error}`);
  if (!tok.refresh_token) {
    throw new Error('Google returned no refresh token. Remove the app at myaccount.google.com/permissions, then run this again.');
  }
  const granted = String(tok.scope || '').split(' ');
  if (!granted.includes(SCOPES[0])) throw new Error('Upload permission wasn\'t granted — tick the YouTube box on the consent screen.');
  console.log('\nRefresh token:', mask(tok.refresh_token));

  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const ch = await chRes.json();
  if (!chRes.ok) throw new Error(`Channel lookup: ${ch.error?.message || chRes.status}`);
  const channel = ch.items && ch.items[0];
  if (!channel) throw new Error('That Google account has no YouTube channel. Sign in again and pick the studio channel.');
  console.log(`Channel: ${channel.snippet.title} (${channel.id})${channel.snippet.customUrl ? '  ' + channel.snippet.customUrl : ''}`);

  const ok = await ask(`Save this channel${SUFFIX ? ` for ${studio}` : ''}? [y/N] `);
  if (!/^y/i.test(ok)) { console.log('Nothing written.'); return; }

  setEnv(lines, 'YT_CLIENT_ID', clientId);
  setEnv(lines, 'YT_CLIENT_SECRET', clientSecret);
  setEnv(lines, key('YT_REFRESH_TOKEN'), tok.refresh_token);
  setEnv(lines, key('YT_CHANNEL_ID'), channel.id);
  setEnv(lines, key('YT_CHANNEL_TITLE'), channel.snippet.title);

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  fs.copyFileSync(ENV_PATH, `${ENV_PATH}.bak-${stamp}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
  console.log(`\nWrote YT_* keys${SUFFIX ? ` for ${SUFFIX}` : ''} to .env (backup: .env.bak-${stamp})`);
  console.log(`Restart to load them: pm2 restart ${path.basename(process.cwd())} --update-env`);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
