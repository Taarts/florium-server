const express = require("express");
const router  = express.Router();
const Class        = require("../models/Class");
const Workshop     = require("../models/Workshop");
const Cancellation = require("../models/Cancellation");
const Override     = require("../models/Override");
const adminAuth  = require("../middleware/auth");

// Teacher pay (per-student rate, ceiling, workshop split) is the owner's business only.
// The public schedule and teachers get classes and workshops without it.
const PAY_FIELDS = ["ratePerStudent", "ceiling", "teacherSplit"];
const isOwner    = req => (adminAuth.peekToken(req) || {}).role === "owner";
const hidePay    = doc => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  for (const f of PAY_FIELDS) delete o[f];
  return o;
};

// ─── Classes ──────────────────────────────────────────────
router.get("/classes", async (req, res) => {
  try {
    const filter = {};
        if (req.query.studio) {
      // Legacy docs have no stored studio; schema default "iy-sp" only applies on hydrate.
      // { $in: [x, null] } matches docs where the field is missing.
      if (req.query.studio === "iy-sp") { filter.$or = [{ studio: { $in: ["iy-sp", null] } }, { isHybrid: true }]; } else { filter.studio = req.query.studio; }
    }
    const classes = await Class.find(filter).sort({ dayOfWeek: 1, time: 1 });
    const today = new Date().toISOString().slice(0, 10);
    const includeEnded = req.query.includeEnded === 'true';
    const active = includeEnded ? classes : classes.filter(c => !c.endDate || c.endDate >= today);
    res.json({ classes: isOwner(req) ? active : active.map(hidePay) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/classes", adminAuth, async (req, res) => {
  try {
    const cls = await Class.create(req.body);
    res.json({ class: cls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/classes/:id", adminAuth, async (req, res) => {
  try {
    const { id, _id, ...updates } = req.body;
    const cls = await Class.findOneAndUpdate(
      { id: req.params.id }, { $set: updates }, { new: true, runValidators: true }
    );
    if (!cls) return res.status(404).json({ error: "Class not found" });
    res.json({ class: cls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/classes/:id", adminAuth, async (req, res) => {
  try {
    const endDate = new Date().toISOString().slice(0, 10);
    const cls = await Class.findOneAndUpdate(
      { id: req.params.id },
      { endDate },
      { new: true }
    );
    if (!cls) return res.status(404).json({ error: "Class not found" });
    res.json({ ok: true, endDate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Workshops ────────────────────────────────────────────
router.get("/workshops", async (req, res) => {
  try {
    const workshops = await Workshop.find().sort({ createdAt: 1 });
    res.json({ workshops: isOwner(req) ? workshops : workshops.map(hidePay) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/workshops", adminAuth, async (req, res) => {
  try {
    const ws = await Workshop.create(req.body);
    res.json({ workshop: ws });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/workshops/:id", adminAuth, async (req, res) => {
  try {
    const { id, _id, ...updates } = req.body;
    const ws = await Workshop.findOneAndUpdate(
      { id: req.params.id }, { $set: updates }, { new: true, runValidators: true }
    );
    if (!ws) return res.status(404).json({ error: "Workshop not found" });
    res.json({ workshop: ws });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/workshops/:id", adminAuth, async (req, res) => {
  try {
    await Workshop.findOneAndDelete({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cancellations ────────────────────────────────────────
router.get("/cancellations", async (req, res) => {
  try {
    const cancellations = await Cancellation.find();
    res.json({ cancellations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/cancellations", adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.body;
    await Cancellation.findOneAndUpdate(
      { classId, date }, { classId, date }, { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/cancellations", adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.body;
    await Cancellation.findOneAndDelete({ classId, date });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Overrides ────────────────────────────────────────────
router.get("/overrides", async (req, res) => {
  try {
    const overrides = await Override.find();
    res.json({ overrides });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/overrides", adminAuth, async (req, res) => {
  try {
    const { classId, date, venue } = req.body;
    const override = await Override.findOneAndUpdate(
      { classId, date }, { classId, date, venue }, { upsert: true, new: true }
    );
    res.json({ override });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/overrides", adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.body;
    await Override.findOneAndDelete({ classId, date });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;