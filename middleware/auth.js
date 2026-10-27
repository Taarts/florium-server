// Admin auth: JWT user accounts, with a temporary ADMIN_SECRET fallback.
//
//   require("../middleware/auth")             → adminAuth (owner-only)
//   require("../middleware/auth").adminAuth   → same
//   requireAuth()                             → any active user
//   requireAuth("owner", "teacher")           → listed roles only
//   peekToken(req)                            → sync signature check (rate limiter skip)
//
// Token: "Authorization: Bearer <token>", or ?token=<token> (PDF links).
// ALLOW_LEGACY_ADMIN_SECRET=false in .env turns the ADMIN_SECRET fallback off.

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

if (!process.env.JWT_SECRET) {
  console.warn("[auth] JWT_SECRET is not set: user logins will fail, only ADMIN_SECRET works.");
}

const ALL_STUDIOS = require("../config/studio").STUDIOS;

function getToken(req) {
  const h = req.headers["authorization"];
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  if (req.query && typeof req.query.token === "string" && req.query.token) return req.query.token;
  return null;
}

function legacyMatch(token) {
  return process.env.ALLOW_LEGACY_ADMIN_SECRET !== "false"
    && Boolean(process.env.ADMIN_SECRET)
    && token === process.env.ADMIN_SECRET;
}

function verifyJwt(token) {
  if (!process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

function peekToken(req) {
  const token = getToken(req);
  if (!token) return null;
  if (legacyMatch(token)) return { legacy: true, role: "owner" };
  return verifyJwt(token);
}

async function authenticate(req) {
  const token = getToken(req);
  if (!token) return null;

  if (legacyMatch(token)) {
    return { id: null, email: null, name: "Admin (legacy secret)", role: "owner",
             studios: ALL_STUDIOS, teacherId: null, legacy: true };
  }

  const payload = verifyJwt(token);
  if (!payload || !payload.sub) return null;

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.active || (user.tokenVersion || 0) !== payload.tv) return null;

  return {
    id: String(user._id), email: user.email, name: user.name, role: user.role,
    studios: user.studios || [], teacherId: user.teacherId ? String(user.teacherId) : null,
    legacy: false,
  };
}

function requireAuth(...roles) {
  return async function (req, res, next) {
    try {
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: "Unauthorised" });
      if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: "Forbidden" });
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function optionalAuth(req, res, next) {
  try { req.user = await authenticate(req); next(); } catch (err) { next(err); }
}

const adminAuth = requireAuth("owner");

module.exports             = adminAuth;
module.exports.adminAuth   = adminAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = (...roles) => requireAuth(...roles);
module.exports.peekToken   = peekToken;
module.exports.optionalAuth = optionalAuth;
module.exports.ALL_STUDIOS = ALL_STUDIOS;
