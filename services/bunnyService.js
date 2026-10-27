const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const API_KEY = process.env.BUNNY_API_KEY;
const CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;

const BASE_URL = `https://video.bunnycdn.com/library/${LIBRARY_ID}`;
const TUS_UPLOAD_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const TUS_SIGNATURE_TTL_SECONDS = 3600; // 1 hour to complete the upload

function assertConfigured() {
  if (!LIBRARY_ID || !API_KEY || !CDN_HOSTNAME) {
    throw new Error('Bunny Stream env vars missing: BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_CDN_HOSTNAME');
  }
}

async function createAndUploadVideo(title, filePath) {
  assertConfigured();

  const createRes = await axios.post(
    `${BASE_URL}/videos`,
    { title },
    { headers: { AccessKey: API_KEY, 'Content-Type': 'application/json' } }
  );

  const bunnyVideoId = createRes.data.guid;
  const stats = fs.statSync(filePath);

  await axios.put(
    `${BASE_URL}/videos/${bunnyVideoId}`,
    fs.createReadStream(filePath),
    {
      headers: {
        AccessKey: API_KEY,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );

  return bunnyVideoId;
}

async function deleteVideo(bunnyVideoId) {
  assertConfigured();
  await axios.delete(`${BASE_URL}/videos/${bunnyVideoId}`, {
    headers: { AccessKey: API_KEY },
  });
}

function getPlaybackUrl(bunnyVideoId) {
  assertConfigured();
  return `https://player.mediadelivery.net/play/${LIBRARY_ID}/${bunnyVideoId}`;
}

function getThumbnailUrl(bunnyVideoId) {
  assertConfigured();
  return `https://${CDN_HOSTNAME}/${bunnyVideoId}/thumbnail.jpg`;
}

async function getVideoStatus(bunnyVideoId) {
  assertConfigured();
  const res = await axios.get(`${BASE_URL}/videos/${bunnyVideoId}`, {
    headers: { AccessKey: API_KEY },
  });
  return res.data;
}
async function createVideoPlaceholder(title) {
  assertConfigured();

  const createRes = await axios.post(
    `${BASE_URL}/videos`,
    { title },
    { headers: { AccessKey: API_KEY, 'Content-Type': 'application/json' } }
  );

  return createRes.data.guid;
}

function getTusUploadCredentials(bunnyVideoId) {
  assertConfigured();

  const expire = Math.floor(Date.now() / 1000) + TUS_SIGNATURE_TTL_SECONDS;
  const signature = crypto
    .createHash('sha256')
    .update(`${LIBRARY_ID}${API_KEY}${expire}${bunnyVideoId}`)
    .digest('hex');

  return {
    endpoint: TUS_UPLOAD_ENDPOINT,
    libraryId: LIBRARY_ID,
    videoId: bunnyVideoId,
    authorizationSignature: signature,
    authorizationExpire: expire,
  };
}

// DEMO_MODE: no Bunny library — the player page shows an illustration instead of streaming.
function demoPlaybackUrl(bunnyVideoId) {
  const base = process.env.DEMO_PLAYER_URL || `${process.env.CLIENT_ORIGIN || ""}/demo-player.html`;
  return `${base}?v=${encodeURIComponent(bunnyVideoId || "")}`;
}

module.exports = {
  createAndUploadVideo,
  createVideoPlaceholder,
  getTusUploadCredentials,
  getPlaybackUrl: require("../config/studio").DEMO_MODE ? demoPlaybackUrl : getPlaybackUrl,
  getThumbnailUrl,
  getVideoStatus,
  deleteVideo,
};