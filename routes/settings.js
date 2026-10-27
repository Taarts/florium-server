const express   = require("express");
const router    = express.Router();
const Settings  = require("../models/Settings");
const adminAuth = require("../middleware/auth");
const { STUDIOS, STUDIO_ID } = require("../config/studio");
const studioOf = req => {
  const s = req.query.studio || req.body?.studio;
  return STUDIOS.includes(s) ? s : STUDIO_ID;
};

// ── GET /api/settings ─────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const settings = await Settings.getSingleton(studioOf(req));
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/settings ───────────────────────────────────
router.patch("/", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["adminEmails", "notificationsEnabled", "notificationMode", "announcementText", "announcementActive", "announcementUrl", "announcementLinkText", "classTypes", "defaultCap", "defaultWaitlistEnabled", "waitlistHoldHours"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (updates.classTypes !== undefined) {
      if (!Array.isArray(updates.classTypes)) return res.status(400).json({ error: "classTypes must be an array" });
      updates.classTypes = updates.classTypes
        .map(t => ({ name: String(t?.name || "").trim().slice(0, 40), color: String(t?.color || "").trim() }))
        .filter(t => t.name && /^#[0-9a-f]{6}$/i.test(t.color))
        .slice(0, 20);
    }

    if (updates.waitlistHoldHours !== undefined) {
      const h = Math.round(Number(updates.waitlistHoldHours));
      if (!Number.isFinite(h) || h < 1 || h > 72) return res.status(400).json({ error: "Hold time must be between 1 and 72 hours." });
      updates.waitlistHoldHours = h;
    }
    if (updates.defaultCap !== undefined && updates.defaultCap !== null) {
      const c = Math.round(Number(updates.defaultCap));
      updates.defaultCap = Number.isFinite(c) && c > 0 ? c : null;
    }
    let settings = await Settings.getSingleton(studioOf(req));
    Object.assign(settings, updates);
    await settings.save();

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;