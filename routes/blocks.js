const express   = require("express");
const router    = express.Router();
const Block     = require("../models/Block");
const adminAuth = require("../middleware/auth");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// ── GET /api/blocks — public: date/time/duration + title (note) ──
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.from && DATE_RE.test(req.query.from)) filter.date = { $gte: req.query.from };
    const blocks = await Block.find(filter)
      .sort({ date: 1, time: 1 })
      .select("_id date time duration note");
    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blocks/admin — admin: includes notes ──
router.get("/admin", adminAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.from && DATE_RE.test(req.query.from)) filter.date = { $gte: req.query.from };
    const blocks = await Block.find(filter).sort({ date: 1, time: 1 });
    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blocks — create one or many (weekly repeat) ──
router.post("/", adminAuth, async (req, res) => {
  try {
    const { dates, date, time, duration, note } = req.body;
    const dateList = dates ?? (date ? [date] : []);
    const mins     = Number(duration);

    if (!dateList.length || !time || !mins) {
      return res.status(400).json({ error: "Date, start time and duration are required." });
    }
    if (!dateList.every(d => DATE_RE.test(d))) {
      return res.status(400).json({ error: "Dates must be YYYY-MM-DD." });
    }
    if (!TIME_RE.test(time)) {
      return res.status(400).json({ error: "Time must be HH:MM (24h)." });
    }
    if (mins < 5 || mins > 1440) {
      return res.status(400).json({ error: "Duration must be between 5 and 1440 minutes." });
    }

    const blocks = await Block.insertMany(
      dateList.map(d => ({ date: d, time, duration: mins, note: (note ?? "").toString().trim() }))
    );
    res.status(201).json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/blocks/:id ──
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const deleted = await Block.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Block not found." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
