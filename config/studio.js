// Per-deployment studio settings. Every default equals today's IY-SP production value,
// so a server whose .env doesn't set these behaves exactly as before.
const list = (v, d) => String(v || d).split(",").map(s => s.trim()).filter(Boolean);

module.exports = {
  DEMO_MODE: process.env.DEMO_MODE === "1",
  STUDIOS:   list(process.env.STUDIOS, "iy-sp,flourish"), // allowed studio ids
  STUDIO_ID: process.env.STUDIO_ID || "iy-sp",            // Stripe metadata tag this server owns
  SITE_URL:  process.env.STUDIO_SITE_URL || process.env.CLIENT_ORIGIN, // student-facing site base for return links
  BOOKING_APP_URL: process.env.BOOKING_APP_URL || "https://florium.studio", // florium-app host; links are <this>/<studioId>?openClass=…
  // Studio name in the membership agreement (text uses "St", PDF heading uses "St.")
  AGREEMENT_NAME:        process.env.AGREEMENT_STUDIO_NAME || "Iyengar Yoga St Petersburg",
  AGREEMENT_HEADER_NAME: process.env.AGREEMENT_STUDIO_NAME || "Iyengar Yoga St. Petersburg",
};
