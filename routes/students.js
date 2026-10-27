const express           = require("express");
const router            = express.Router();
const Student           = require("../models/Student");
const Booking           = require("../models/Booking");
const Pass              = require("../models/Pass");
const adminAuth         = require("../middleware/auth");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { canAccessStudent } = require("../middleware/scope");
const Class             = require("../models/Class");
const { validateEmail } = require("../utils/validateEmail");

// ── POST /api/students/register ────────────────────────────
// Called when a student books their first class.
// Upserts so repeat visitors don't create duplicate records.
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email)
      return res.status(400).json({ error: "Name and email are required." });

    const student = await Student.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: { name, phone },
        $setOnInsert: { firstVisit: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ student });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/students/:email ───────────────────────────────
// Returns student profile + active passes + recent bookings.
// GET /api/students/search?q= — owner + teachers: lookup for booking a student in.
// Returns name, email and active passes only.
router.get("/search", requireAuth("owner", "teacher"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ students: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const students = await Student.find({ $or: [{ name: rx }, { email: rx }] }, "name email").limit(10).lean();
    const now = new Date();
    const passes = await Pass.find({
      studentEmail: { $in: students.map(st => st.email) },
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }, "studentEmail code type classesTotal classesUsed expiresAt").lean();
    const byEmail = {};
    for (const p of passes) {
      (byEmail[p.studentEmail] ||= []).push({
        type: p.type,
        code: p.code,
        classesRemaining: p.classesTotal != null ? p.classesTotal - p.classesUsed : null,
        expiresAt: p.expiresAt || null,
      });
    }
    // Teachers can find any student to book them in, but don't see pass codes: Add Student
    // then books with the student's own pass by email (bookings.js /admin-add).
    const isOwner = req.user.role === "owner";
    const passesFor = email => (byEmail[email] || []).map(p => isOwner ? p : { ...p, code: undefined });
    res.json({ students: students.map(st => ({ name: st.name, email: st.email, passes: passesFor(st.email) })) });
  } catch (err) { next(err); }
});

router.get("/:email", optionalAuth, async (req, res, next) => {
  try {
    const email   = req.params.email.toLowerCase().trim();
    const student = await Student.findOne({ email });
    if (!student)
      return res.status(404).json({ error: "Student not found." });

    const allPasses = await Pass.find({ studentEmail: email }).sort({ createdAt: -1 });
    const passes    = allPasses.filter(p => p.active);
   const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const rawBookings = await Booking.find({
          studentEmail: email,
          date: { $gte: oneMonthAgo.toISOString().slice(0, 10) }
        })
          .sort({ createdAt: -1 })
          .limit(20);

    const classIds = [...new Set(
      rawBookings.map(b => b.classId).filter(id => id && !id.startsWith('ws_') && !id.startsWith('private__'))
    )];
    const classes  = await Class.find({ id: { $in: classIds } }, "id title").lean();
    const classMap = Object.fromEntries(classes.map(c => [c.id, c.title]));

    const bookings = rawBookings.map(b => ({
      ...b.toObject(),
      classTitle: b.workshopTitle || classMap[b.classId] || null,
    }));

    const u = req.user;
    const fullAccess = Boolean(u) && (u.role === "owner" || (u.role === "teacher" && await canAccessStudent(u, email)));
    if (fullAccess) return res.json({ student, passes: allPasses, bookings });

    // Public callers (My Bookings, booking modal): no contact details, payment ids or notes.
    const strip = (o) => Object.fromEntries(
      Object.entries(o).filter(([k]) => !/phone|stripe|paymentintent|notes|address|^ip$/i.test(k))
    );
    res.json({
      student:  { name: student.name },
      // No pass id or code in public: My Bookings and the booking modal only need type, counts and expiry
      passes:   passes.map(p => {
        const { _id, code, ...rest } = strip(p.toObject ? p.toObject() : p);
        return rest;
      }),
      bookings: bookings.map(strip),
    });
  } catch (err) {
    next(err);
  }
});
// ── GET /api/students (admin only) ────────────────────────
// Returns all students — for admin dashboard.
router.get("/", adminAuth, async (req, res, next) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json({ students });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/students/:email/notes (admin only) ─────────
// Lets admin add private notes to a student record.
router.patch("/:email/notes", adminAuth, async (req, res, next) => {
  try {
    const { notes } = req.body;
    const student   = await Student.findOneAndUpdate(
      { email: req.params.email.toLowerCase() },
      { notes },
      { new: true }
    );
    if (!student)
      return res.status(404).json({ error: "Student not found." });
    res.json({ student });
  } catch (err) {
    next(err);
  }
});

// DELETE student by id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;