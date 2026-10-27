const express   = require("express");
const router    = express.Router();
const Student   = require("../models/Student");
const Booking   = require("../models/Booking");
const adminAuth = require("../middleware/auth");
const { requireAuth } = require("../middleware/auth");
const { canAccessClass, canAccessStudent, teacherRecord } = require("../middleware/scope");
const { sendBulkEmail } = require("../email");
const { signatureHtmlFor } = require("../signatureRender");

const staffAuth  = requireAuth("owner", "teacher");
const STUDIO_BCC = process.env.TEACHER_MSG_BCC || "info@flourishyoga.studio";

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

// Teachers: rosters of their own classes, or individuals who've booked their classes. Never "all".
async function teacherAudienceError(user, audience) {
  if (user.role === "owner") return null;
  if (!audience || audience.type === "all") return "Teachers can't message all students.";
  if (audience.type === "roster" && !(await canAccessClass(user, audience.classId)))
    return "That class isn't one of yours.";
  if (audience.type === "individual" && !(await canAccessStudent(user, audience.studentEmail)))
    return "You can only message students who've booked your classes.";
  return null;
}

router.get("/roster-preview", staffAuth, async (req, res) => {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) return res.status(400).json({ error: "classId and date are required" });
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: "Forbidden" });
    const recipients = await resolveAudience({ type: "roster", classId, date });
    res.json({ count: recipients.length, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/all-count", adminAuth, async (req, res) => {
  try {
    const count = await Student.countDocuments({});
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/email", staffAuth, async (req, res) => {
  try {
    const { audience, subject, body, signatureId } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "subject and body are required" });

    const denied = await teacherAudienceError(req.user, audience);
    if (denied) return res.status(403).json({ error: denied });

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) return res.status(400).json({ error: "No recipients matched this audience." });
    let sigId = typeof signatureId === "string" ? signatureId : "default";
    if (req.user?.role !== "owner" && sigId !== "none") sigId = "me";   // teachers sign as themselves
    const signatureHtml = await signatureHtmlFor(sigId, undefined, req.user);

    // Teacher sends: replies go to the teacher; the studio gets one BCC copy per send.
    let replyTo = null;
    let bccFirst = null;
    if (req.user.role !== "owner") {
      const t = await teacherRecord(req.user);
      replyTo  = { email: t?.email || req.user.email, name: t?.name || req.user.name };
      bccFirst = STUDIO_BCC;
    }

    const results = await Promise.all(
      recipients.map((r, i) => sendBulkEmail({
        email: r.email, name: r.name, subject, bodyText: body, signatureHtml,
        replyTo, bcc: i === 0 ? bccFirst : null,
      }))
    );

    const sent   = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent);

    res.json({ sent, total: recipients.length, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
