// Image uploads for classes, workshops and teachers.
// POST /api/uploads/images  (owner)  multipart field "image" → { path: "/uploads/images/<file>" }
// GET  /api/uploads/images/<file>    public, long-cached
// Stored paths are relative to the API base so they work from any studio domain.
const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const crypto   = require("crypto");
const multer   = require("multer");
const adminAuth = require("../middleware/auth");

const router = express.Router();
const DIR = path.join(__dirname, "..", "uploads", "images");
fs.mkdirSync(DIR, { recursive: true });

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + EXT[file.mimetype]),
  }),
  limits: { fileSize: (Number(process.env.UPLOAD_MAX_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT[file.mimetype])),
});

router.post("/images", adminAuth, (req, res) => {
  upload.single("image")(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image is over 5 MB." : err.message });
    if (!req.file) return res.status(400).json({ error: "Upload a JPG, PNG, WebP or GIF." });
    res.json({ path: `/uploads/images/${req.file.filename}` });
  });
});

router.use("/images", express.static(DIR, { maxAge: "365d", immutable: true, index: false, dotfiles: "deny", fallthrough: false }));

module.exports = router;
