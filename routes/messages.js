const express   = require("express");
const router    = express.Router();
const Student   = require("../models/Student");
const Booking   = require("../models/Booking");
const adminAuth = require("../middleware/auth");
const { sendBulkEmail } = require("../email");

// ── Resolve audience server-side — never trust a client-supplied list ──
async function resolveAudience(audience) {
  if (!audience || !audience.type) throw new Error("audience.type is required");

  if (audience.type === "individual") {
    if (!audience.studentEmail) throw new Error("studentEmail is required for individual audience");
    const email = audience.studentEmail.toLowerCase().trim();
    const student = await Student.findOne({ email });
    return [{ email, name: student?.name || "" }];
  }

  if (audience.type === "roster") {
    if (!audience.classId || !audience.date) throw new Error("classId and date are required for roster audience");
    const bookings = await Booking.find({
      classId: audience.classId,
      date: audience.date,
      status: "confirmed",
    });
    const seen = new Set();
    const recipients = [];
    for (const b of bookings) {
      if (seen.has(b.studentEmail)) continue;
      seen.add(b.studentEmail);
      recipients.push({ email: b.studentEmail, name: b.studentName || "" });
    }
    return recipients;
  }

  if (audience.type === "all") {
    const students = await Student.find({}, "email name");
    return students.map(s => ({ email: s.email, name: s.name || "" }));
  }

  throw new Error(`Unknown audience type: ${audience.type}`);
}

// ── GET /api/messages/roster-preview?classId=&date= ──────────
// Lets the compose UI show "N recipients" before sending
router.get("/roster-preview", adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) return res.status(400).json({ error: "classId and date are required" });
    const recipients = await resolveAudience({ type: "roster", classId, date });
    res.json({ count: recipients.length, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages/all-count ───────────────────────────────
// Lets the compose UI show "N recipients" for the "all students" audience
router.get("/all-count", adminAuth, async (req, res) => {
  try {
    const count = await Student.countDocuments({});
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/messages/email ──────────────────────────────────
router.post("/email", adminAuth, async (req, res) => {
  try {
    const { audience, subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "subject and body are required" });

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) return res.status(400).json({ error: "No recipients matched this audience." });

    const results = await Promise.all(
      recipients.map(r => sendBulkEmail({ email: r.email, name: r.name, subject, bodyText: body }))
    );

    const sent   = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent);

    res.json({ sent, total: recipients.length, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
