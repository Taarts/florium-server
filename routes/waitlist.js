const express = require('express');
const router = express.Router();
const Waitlist = require('../models/Waitlist');
const { adminAuth } = require('../middleware/auth');
const { reorderWaitlist, findOffer, respondToOffer, promoteWaitlist } = require('../utils/waitlist');

// ── Public: the Confirm / Cancel page reads the offer behind the emailed token ──
// GET /api/waitlist/offer?token=
router.get('/offer', async (req, res) => {
  try {
    const found = await findOffer(String(req.query.token || ''));
    if (!found) return res.status(410).json({ error: 'This offer has expired or was already used.' });
    const { entry, cls } = found;
    res.json({ offer: {
      classTitle: cls.title, date: entry.date, time: cls.time, duration: cls.duration,
      teacher: cls.teacher, holdUntil: entry.holdUntil, name: entry.studentName,
    } });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/waitlist/respond  { token, action: "confirm" | "cancel" }
router.post('/respond', async (req, res) => {
  try {
    const { token, action } = req.body || {};
    const result = await respondToOffer(String(token || ''), String(action || ''));
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('[waitlist respond]', err);
    res.status(500).json({ error: 'Server error — please try again.' });
  }
});

// ── Admin ──
// GET /api/waitlist?classId=&date=
router.get('/', adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) return res.status(400).json({ error: 'classId and date required' });
    const list = await Waitlist.find({ classId, date }).sort({ position: 1 }).select('-token');
    res.json({ waitlist: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/waitlist/:id — admin removes someone (frees their held spot if they had one)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const entry = await Waitlist.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    await reorderWaitlist(entry.classId, entry.date);
    if (entry.status === 'offered') promoteWaitlist(entry.classId, entry.date).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, reorderWaitlist };
