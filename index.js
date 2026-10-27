require("dotenv").config();
const { DEMO_MODE } = require("./config/studio");
if (DEMO_MODE) {
  if (String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")) {
    console.error("✗ DEMO_MODE refuses a live Stripe key — use sk_test_"); process.exit(1);
  }
  console.log("· DEMO_MODE on — email suppressed, cron off, account changes locked");
}
const express       = require("express");
const mongoose      = require("mongoose");
const cors          = require("cors");
const studentRoutes = require("./routes/students");
const passRoutes    = require("./routes/passes");
const bookingRoutes = require("./routes/bookings");
const messagesRouter = require("./routes/messages");
const paymentsRouter = require("./routes/payments");  
const reportsRouter = require("./routes/reports");
const scheduleRouter = require("./routes/schedule");
const waiverRouter = require("./routes/waiver");
const merchRouter    = require("./routes/merch"); 
const settingsRouter = require("./routes/settings");
const teachersRouter = require("./routes/teachers");
const videosRouter = require("./routes/videos");
const couponsRouter  = require("./routes/coupons");
const venuesRouter   = require("./routes/venues");
const stripeWebhookRouter = require("./routes/stripeWebhook");
const membershipAgreementRouter = require("./routes/membershipAgreement");
const app = express();
app.set("trust proxy", 1); // behind nginx: req.ip = real client IP for rate limiting

// ── Rate limiting ──────────────────────────────────────────
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  skip: req => req.path.startsWith("/uploads/images/") || Boolean(require("./middleware/auth").peekToken(req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// ── Middleware ─────────────────────────────────────────────

app.use(cors({
  origin: [
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_ORIGIN_ALT,
    process.env.CLIENT_ORIGIN_ALT2,
    process.env.CLIENT_ORIGIN_ALT3,
    "http://localhost:3000",
  ].filter(Boolean),
}));

// Stripe webhook MUST be mounted before express.json() so the raw body
// is available for signature verification. The router applies its own
// express.raw({ type: 'application/json' }) middleware on the route.
app.use("/api/stripe", stripeWebhookRouter);

app.use(express.json());

// ── Routes ─────────────────────────────────────────────────
app.use("/api/students",  studentRoutes);
app.use("/api/passes",    passRoutes);
app.use("/api/bookings",  bookingRoutes);
app.use("/api/messages",  messagesRouter);
app.use("/api/payments",  paymentsRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/merch", merchRouter);
app.use("/api/sales", require("./routes/sales"));
app.use("/api/reports", reportsRouter);
app.use("/api/waiver", waiverRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/coupons",  couponsRouter);
app.use("/api/waitlist", require("./routes/waitlist").router);
if (DEMO_MODE) {
  app.post("/api/videos/init-upload", (req, res) => res.status(403).json({ error: "Video uploads are turned off in the demo." }));
  app.delete("/api/videos/:id", (req, res) => res.status(403).json({ error: "Videos can't be deleted in the demo." }));
}
app.use("/api/videos", videosRouter);
app.use("/api/venues",   venuesRouter);
app.use("/api/blocks",   require("./routes/blocks"));
app.use("/api/newsletter", require("./routes/newsletter"));
app.use("/api/signatures", require("./routes/signatures"));
app.use("/api/forms", require("./routes/forms"));
app.use("/api/membership-agreement", membershipAgreementRouter);
// DEMO_MODE: the public demo logins can't be changed or added to
if (DEMO_MODE) {
  const demoLocked = (req, res) => res.status(403).json({ error: "Demo accounts can't be changed." });
  app.use("/api/users", (req, res, next) => (req.method === "GET" ? next() : demoLocked(req, res)));
  app.use("/api/auth", (req, res, next) =>
    (req.method !== "GET" && /password/i.test(req.path) ? demoLocked(req, res) : next()));
}
app.use("/api/auth",  require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/uploads", require("./routes/uploads"));
app.get("/api/files/local", require("./s3").serveLocal); // only active when no S3 bucket is set

// ── Health check ───────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// ── Database + start ───────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✓ MongoDB connected");
    if (process.env.DISABLE_CRON === "1") console.log("⚠ Cron disabled (DISABLE_CRON=1)");
    else require("./cron");
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
    server.timeout = 3600000;
  })
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });
