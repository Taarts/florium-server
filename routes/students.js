const express  = require("express");
const router   = express.Router();
const Student  = require("../models/Student");
const Booking  = require("../models/Booking");
const Pass     = require("../models/Pass");
const adminAuth = require("../middleware/auth");

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
      { name, phone },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ student });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/students/:email ───────────────────────────────
// Returns student profile + active passes + recent bookings.
router.get("/:email", async (req, res, next) => {
  try {
    const email   = req.params.email.toLowerCase().trim();
    const student = await Student.findOne({ email });
    if (!student)
      return res.status(404).json({ error: "Student not found." });

    const passes   = await Pass.find({ studentEmail: email, active: true });
    const bookings = await Booking.find({ studentEmail: email })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ student, passes, bookings });
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

module.exports = router;
