// Per-deployment studio settings. Every default equals today's IY-SP production value,
// so a server whose .env doesn't set these behaves exactly as before.
const list = (v, d) => String(v || d).split(",").map(s => s.trim()).filter(Boolean);

const STUDIOS   = list(process.env.STUDIOS, "iy-sp,flourish");
const STUDIO_ID = process.env.STUDIO_ID || "iy-sp";

// Studio named in the membership agreement, per studio sharing this server
// (text uses "St", PDF heading uses "St."). AGREEMENT_STUDIO_NAME in .env overrides
// the name for this server's own STUDIO_ID.
const AGREEMENT_NAMES = {
  "iy-sp":    { name: "Iyengar Yoga St Petersburg", header: "Iyengar Yoga St. Petersburg" },
  "flourish": { name: "Flourish Yoga & Wellness",   header: "Flourish Yoga & Wellness" },
};
const resolveStudio = (studio) => (STUDIOS.includes(studio) ? studio : STUDIO_ID);
function agreementNames(studio) {
  const id = resolveStudio(studio);
  if (id === STUDIO_ID && process.env.AGREEMENT_STUDIO_NAME) {
    return { name: process.env.AGREEMENT_STUDIO_NAME, header: process.env.AGREEMENT_STUDIO_NAME };
  }
  return AGREEMENT_NAMES[id] || AGREEMENT_NAMES["iy-sp"];
}

module.exports = {
  DEMO_MODE: process.env.DEMO_MODE === "1",
  STUDIOS,                                                  // allowed studio ids
  STUDIO_ID,                                                // Stripe metadata tag this server owns
  resolveStudio,
  agreementNames,
  SITE_URL:  process.env.STUDIO_SITE_URL || process.env.CLIENT_ORIGIN, // student-facing site base for return links
  BOOKING_APP_URL: process.env.BOOKING_APP_URL || "https://florium.studio", // florium-app host; links are <this>/<studioId>?openClass=…
  // Studio name in the membership agreement (text uses "St", PDF heading uses "St.")
  AGREEMENT_NAME:        process.env.AGREEMENT_STUDIO_NAME || "Iyengar Yoga St Petersburg",
  AGREEMENT_HEADER_NAME: process.env.AGREEMENT_STUDIO_NAME || "Iyengar Yoga St. Petersburg",
};
