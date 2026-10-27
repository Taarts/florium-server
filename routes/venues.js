const express   = require("express");
const router    = express.Router();
const Venue     = require("../models/Venue");
const adminAuth = require("../middleware/auth");

// GET /api/venues — all active venues (public)
router.get("/", async (req, res, next) => {
  try {
    const venues = await Venue.find({ active: true }).sort({ name: 1 });
    res.json({ venues });
  } catch (err) { next(err); }
});

// POST /api/venues — create new venue
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const { name, address, mapsLink, capacity } = req.body;
    const id = "venue_" + Date.now();
    const venue = await Venue.create({ id, name, address, mapsLink, capacity });
    res.json({ venue });
  } catch (err) { next(err); }
});

// PATCH /api/venues/:id — update venue
router.patch("/:id", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["name", "address", "mapsLink", "capacity", "active"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const venue = await Venue.findOneAndUpdate({ id: req.params.id }, updates, { new: true });
    if (!venue) return res.status(404).json({ error: "Venue not found" });
    res.json({ venue });
  } catch (err) { next(err); }
});

// DELETE /api/venues/:id — soft delete
router.delete("/:id", adminAuth, async (req, res, next) => {
  try {
    const venue = await Venue.findOneAndUpdate({ id: req.params.id }, { active: false }, { new: true });
    if (!venue) return res.status(404).json({ error: "Venue not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
