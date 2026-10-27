const express   = require("express");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User      = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// Compared against when the email doesn't exist, so response timing doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

function publicUser(u) {
  return {
    id: String(u._id), email: u.email, name: u.name, role: u.role,
    studios: u.studios || [], teacherId: u.teacherId ? String(u.teacherId) : null,
  };
}

function signToken(u) {
  return jwt.sign(
    { sub: String(u._id), role: u.role, studios: u.studios || [],
      teacherId: u.teacherId ? String(u.teacherId) : null, name: u.name, tv: u.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /api/auth/login  { email, password } → { token, user }
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email    = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    if (!process.env.JWT_SECRET) return res.status(500).json({ error: "Login is not configured" });

    const user = await User.findOne({ email }).select("+passwordHash");
    const ok   = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok || !user.active) return res.status(401).json({ error: "Invalid email or password" });

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me → { user }
router.get("/me", requireAuth(), async (req, res, next) => {
  try {
    const classIds = await require("../middleware/scope").scopedClassIds(req.user);
    res.json({ user: req.user, scope: { classIds } });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password  { currentPassword, newPassword } → { token, user }
// Revokes the user's other sessions (tokenVersion bump); returns a fresh token for this one.
router.post("/change-password", requireAuth(), loginLimiter, async (req, res, next) => {
  try {
    if (req.user.legacy || !req.user.id) return res.status(400).json({ error: "Not available for this login" });
    const current = String(req.body?.currentPassword || "").trim();
    const fresh   = String(req.body?.newPassword || "").trim();
    if (fresh.length < 10) return res.status(400).json({ error: "New password must be at least 10 characters" });
    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!user || !(await bcrypt.compare(current, user.passwordHash)))
      return res.status(400).json({ error: "Current password is incorrect" });
    user.passwordHash = await bcrypt.hash(fresh, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.signToken  = signToken;
module.exports.publicUser = publicUser;
