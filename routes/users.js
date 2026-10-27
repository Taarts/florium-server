// Owner-only user management. DELETE deactivates (keeps the record).
// Any change to role, studios, teacherId, active or password revokes the user's existing tokens.
const express  = require("express");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");
const Teacher  = require("../models/Teacher");
const { requireAuth, ALL_STUDIOS } = require("../middleware/auth");
const { publicUser } = require("./auth");

const router = express.Router();
router.use(requireAuth("owner"));

const ROLES  = ["owner", "teacher"];
const MIN_PW = 10;

const bad  = (res, error, code = 400) => res.status(code).json({ error });
const view = (u) => ({ ...publicUser(u), active: u.active, lastLoginAt: u.lastLoginAt || null, createdAt: u.createdAt });

function cleanStudios(v) {
  if (!Array.isArray(v)) return null;
  const s = [...new Set(v.map(String))];
  return s.every(x => ALL_STUDIOS.includes(x)) ? s : null;
}

async function checkTeacherId(id) {
  if (id === null || id === undefined || id === "") return { ok: true, value: null };
  if (!mongoose.isValidObjectId(id)) return { ok: false };
  return (await Teacher.exists({ _id: id })) ? { ok: true, value: id } : { ok: false };
}

async function isLastActiveOwner(user) {
  if (user.role !== "owner" || !user.active) return false;
  const others = await User.countDocuments({ role: "owner", active: true, _id: { $ne: user._id } });
  return others === 0;
}

async function loadUser(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { bad(res, "User not found", 404); return null; }
  const user = await User.findById(req.params.id);
  if (!user) { bad(res, "User not found", 404); return null; }
  return user;
}

// GET /api/users
router.get("/", async (req, res, next) => {
  try {
    const users = await User.find().sort({ role: 1, name: 1 }).lean();
    res.json(users.map(view));
  } catch (err) { next(err); }
});

// POST /api/users  { email, name, password, role, studios, teacherId }
router.post("/", async (req, res, next) => {
  try {
    const { email, name, password, role = "teacher", studios = [], teacherId = null } = req.body || {};
    if (!email || !String(email).includes("@") || !name) return bad(res, "email and name are required");
    if (!ROLES.includes(role)) return bad(res, "role must be owner or teacher");
    const st = cleanStudios(studios);
    if (!st) return bad(res, `studios must be a subset of: ${ALL_STUDIOS.join(", ")}`);
    if (String(password || "").trim().length < MIN_PW) return bad(res, `password must be at least ${MIN_PW} characters`);
    const t = await checkTeacherId(teacherId);
    if (!t.ok) return bad(res, "teacherId not found");

    const user = await User.create({
      email, name, role, studios: st, teacherId: t.value,
      passwordHash: await bcrypt.hash(String(password).trim(), 12),
    });
    res.status(201).json(view(user));
  } catch (err) {
    if (err.code === 11000) return bad(res, "A user with that email already exists", 409);
    next(err);
  }
});

// PATCH /api/users/:id  { name?, email?, role?, studios?, teacherId?, active?, password? }
router.patch("/:id", async (req, res, next) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;
    const b = req.body || {};
    let revoke = false;

    if (b.name !== undefined) user.name = String(b.name).trim();
    if (b.email !== undefined) {
      if (!String(b.email).includes("@")) return bad(res, "invalid email");
      user.email = String(b.email).trim().toLowerCase();
    }
    if (b.role !== undefined && b.role !== user.role) {
      if (!ROLES.includes(b.role)) return bad(res, "role must be owner or teacher");
      if (await isLastActiveOwner(user)) return bad(res, "Can't demote the last active owner");
      user.role = b.role; revoke = true;
    }
    if (b.studios !== undefined) {
      const st = cleanStudios(b.studios);
      if (!st) return bad(res, `studios must be a subset of: ${ALL_STUDIOS.join(", ")}`);
      user.studios = st; revoke = true;
    }
    if (b.teacherId !== undefined) {
      const t = await checkTeacherId(b.teacherId);
      if (!t.ok) return bad(res, "teacherId not found");
      user.teacherId = t.value; revoke = true;
    }
    if (b.active !== undefined && Boolean(b.active) !== user.active) {
      if (!b.active && await isLastActiveOwner(user)) return bad(res, "Can't deactivate the last active owner");
      user.active = Boolean(b.active); revoke = true;
    }
    if (b.password !== undefined) {
      if (String(b.password).trim().length < MIN_PW) return bad(res, `password must be at least ${MIN_PW} characters`);
      user.passwordHash = await bcrypt.hash(String(b.password).trim(), 12); revoke = true;
    }
    if (revoke) user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();
    res.json(view(user));
  } catch (err) {
    if (err.code === 11000) return bad(res, "A user with that email already exists", 409);
    next(err);
  }
});

// DELETE /api/users/:id → deactivate
router.delete("/:id", async (req, res, next) => {
  try {
    const user = await loadUser(req, res);
    if (!user) return;
    if (await isLastActiveOwner(user)) return bad(res, "Can't deactivate the last active owner");
    user.active = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json(view(user));
  } catch (err) { next(err); }
});

module.exports = router;
