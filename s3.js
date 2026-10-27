// server/s3.js
// AWS S3 helper for waiver PDF storage

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

// ── No bucket configured (e.g. the demo) ───────────────────
// PDFs are kept on this server's disk (uploads/files-local, outside git and rsync) and
// handed out as short-lived signed links served by GET /api/files/local.
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const USE_LOCAL = !BUCKET;
const LOCAL_DIR = path.join(__dirname, "uploads", "files-local");
const localPath = key => path.join(LOCAL_DIR, "f_" + String(key).replace(/[^a-zA-Z0-9._@-]/g, "_"));
const signLocal = (key, exp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET || "local-files").update(`${key}|${exp}`).digest("hex");

async function saveLocal(buffer, key) {
  await fs.promises.mkdir(LOCAL_DIR, { recursive: true });
  await fs.promises.writeFile(localPath(key), buffer);
  return key;
}
const readLocal = key => fs.promises.readFile(localPath(key));

function localUrl(key) {
  const exp  = Date.now() + 3600 * 1000;
  const base = process.env.LOCAL_FILES_BASE_URL || "";
  return `${base}/api/files/local?key=${encodeURIComponent(key)}&exp=${exp}&sig=${signLocal(key, exp)}`;
}

async function serveLocal(req, res) {
  const key = String(req.query.key || ""), exp = String(req.query.exp || ""), sig = String(req.query.sig || "");
  if (!USE_LOCAL || !key || !exp || !sig) return res.status(404).end();
  const good = signLocal(key, exp);
  const ok = sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  if (!ok || Date.now() > Number(exp)) return res.status(403).json({ error: "Link expired or invalid." });
  try {
    const buf = await readLocal(key);
    res.type(key.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream").send(buf);
  } catch {
    res.status(404).json({ error: "File not found." });
  }
}

/**
 * Upload a buffer to S3.
 * @param {Buffer} buffer    - File contents
 * @param {string} key       - S3 object key e.g. "waivers/YYYY-MM-DD_email.pdf"
 * @param {string} mimeType  - e.g. "application/pdf"
 * @returns {string}         - Public S3 URL (or use getWaiverUrl for private buckets)
 */
async function uploadToS3(buffer, key, mimeType = "application/pdf") {
  if (USE_LOCAL) return saveLocal(buffer, key);
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));

  // Return the S3 key — we store this on the student record, not a full URL
  // Use getWaiverUrl() to generate a signed URL when needed
  return key;
}

/**
 * Generate a pre-signed URL for a private S3 object.
 * URL expires after 1 hour — sufficient for email attachment generation.
 * @param {string} key - S3 object key
 * @returns {string}   - Signed URL
 */
async function getWaiverUrl(key) {
  if (USE_LOCAL) return localUrl(key);
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * Fetch an S3 object as a Buffer (for email attachments).
 * @param {string} key - S3 object key
 * @returns {Buffer}
 */
async function getWaiverBuffer(key) {
  if (USE_LOCAL) return readLocal(key);
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { uploadToS3, getWaiverUrl, getWaiverBuffer, serveLocal };
