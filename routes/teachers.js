const express   = require("express");
const router    = express.Router();
const Teacher   = require("../models/Teacher");
const adminAuth = require("../middleware/auth");
const { optionalAuth } = require("../middleware/auth");

// GET /api/teachers
// Public: name, bio, image only. Owner token: full records (email, pay rate).
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const isOwner  = req.user?.role === "owner";
    const teachers = await Teacher.find({ active: true }, isOwner ? undefined : "name bio image").sort({ name: 1 });
    res.json({ teachers });
  } catch (err) { next(err); }
});

// POST /api/teachers
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const { name, email, payRate, bio, image } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required." });
    const teacher = await Teacher.create({ name, email, payRate: payRate ?? 0, bio, image });
    res.status(201).json({ teacher });
  } catch (err) { next(err); }
});

// PATCH /api/teachers/:id
router.patch("/:id", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["name", "email", "payRate", "bio", "image", "active"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!teacher) return res.status(404).json({ error: "Teacher not found." });
    res.json({ teacher });
  } catch (err) { next(err); }
});

// DELETE /api/teachers/:id
router.delete("/:id", adminAuth, async (req, res, next) => {
  try {
    await Teacher.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
