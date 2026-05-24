const express  = require("express");
const router   = express.Router();
const Settings = require("../models/Settings");
const adminAuth = require("../middleware/auth");

router.get("/", adminAuth, async (req, res, next) => {
  try {
    const settings = await Settings.getSingleton();
    res.json({ settings });
  } catch (err) { next(err); }
});

router.patch("/", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["adminEmails", "notificationsEnabled", "notificationMode"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    let settings = await Settings.getSingleton();
    Object.assign(settings, updates);
    await settings.save();
    res.json({ settings });
  } catch (err) { next(err); }
});

module.exports = router;
