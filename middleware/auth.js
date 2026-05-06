// Simple secret-key middleware for admin routes.
// The calendar's admin panel sends this header:
// Authorization: Bearer <ADMIN_SECRET>
//
// TODO: replace with proper JWT auth when student accounts are added

module.exports = function adminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
};
