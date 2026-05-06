// server/middleware/kioskAuth.js
// Separate authentication for the iPad kiosk check-in page.
// Accepts KIOSK_TOKEN from .env — scoped to check-in only, not full admin access.
// If no KIOSK_TOKEN is set, falls back to accepting the ADMIN_SECRET so
// development works without extra config.

module.exports = function kioskAuth(req, res, next) {
  const token        = req.headers.authorization?.split(" ")[1];
  const kioskToken   = process.env.KIOSK_TOKEN;
  const adminSecret  = process.env.ADMIN_SECRET;

  if (!token) {
    return res.status(403).json({ error: "Kiosk token required." });
  }

  // Accept kiosk token (preferred) or admin secret (fallback for dev)
  if ((kioskToken && token === kioskToken) || token === adminSecret) {
    return next();
  }

  return res.status(403).json({ error: "Invalid kiosk token." });
};