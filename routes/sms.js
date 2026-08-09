const express   = require("express");
const router    = express.Router();
const Student   = require("../models/Student");
const Booking   = require("../models/Booking");
const adminAuth = require("../middleware/auth");

const twilioClient = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER   = process.env.TWILIO_PHONE_NUMBER;

// ── Resolve audience server-side — never trust a client-supplied list ──
// Only returns students who have BOTH a phone number on file AND have
// opted in to SMS (smsOptIn: true on Student). Silently excludes anyone
// missing either — the send count will reflect real reachable recipients.
async function resolveAudience(audience) {
  if (!audience || !audience.type) throw new Error("audience.type is required");

  if (audience.type === "individual") {
    if (!audience.studentEmail) throw new Error("studentEmail is required for individual audience");
    const email = audience.studentEmail.toLowerCase().trim();
    const student = await Student.findOne({ email });
    if (!student) throw new Error("No student found with that email.");
    if (!student.phone) throw new Error("This student has no phone number on file.");
    if (!student.smsOptIn) throw new Error("This student has not opted in to SMS.");
    return [{ phone: student.phone, name: student.name || "" }];
  }

  if (audience.type === "roster") {
    if (!audience.classId || !audience.date) throw new Error("classId and date are required for roster audience");
    const bookings = await Booking.find({
      classId: audience.classId,
      date: audience.date,
      status: "confirmed",
    });
    const emails = [...new Set(bookings.map(b => b.studentEmail))];
    const students = await Student.find({ email: { $in: emails }, phone: { $ne: null, $ne: "" }, smsOptIn: true });
    return students.map(s => ({ phone: s.phone, name: s.name || "" }));
  }

  if (audience.type === "all") {
    const students = await Student.find({ phone: { $ne: null, $ne: "" }, smsOptIn: true });
    return students.map(s => ({ phone: s.phone, name: s.name || "" }));
  }

  throw new Error(`Unknown audience type: ${audience.type}`);
}

// ── GET /api/sms/roster-preview?classId=&date= ────────────────
router.get("/roster-preview", adminAuth, async (req, res) => {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) return res.status(400).json({ error: "classId and date are required" });
    const recipients = await resolveAudience({ type: "roster", classId, date });
    res.json({ count: recipients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sms/all-count ──────────────────────────────────────
router.get("/all-count", adminAuth, async (req, res) => {
  try {
    const count = await Student.countDocuments({ phone: { $ne: null, $ne: "" }, smsOptIn: true });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sms/send ────────────────────────────────────────
router.post("/send", adminAuth, async (req, res) => {
  try {
    if (!FROM_NUMBER) return res.status(500).json({ error: "SMS is not configured (missing TWILIO_PHONE_NUMBER)." });

    const { audience, body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required." });
    if (body.length > 1600) return res.status(400).json({ error: "Message is too long (max 1600 characters)." });

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) return res.status(400).json({ error: "No opted-in recipients with a phone number matched this audience." });

    const results = await Promise.all(recipients.map(async r => {
      try {
        await twilioClient.messages.create({ to: r.phone, from: FROM_NUMBER, body: body.trim() });
        return { phone: r.phone, sent: true };
      } catch (err) {
        console.error(`✗ SMS failed for ${r.phone}:`, err.message);
        return { phone: r.phone, sent: false, error: err.message };
      }
    }));

    const sent   = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent);

    res.json({ sent, total: recipients.length, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
