require("dotenv").config();
const express        = require("express");
const mongoose       = require("mongoose");
const cors           = require("cors");
const studentRoutes  = require("./routes/students");
const passRoutes     = require("./routes/passes");
const bookingRoutes  = require("./routes/bookings");
const acuityRoutes   = require("./routes/acuity");
const paymentsRouter = require("./routes/payments");
const reportsRouter  = require("./routes/reports");
const scheduleRouter = require("./routes/schedule");
const waiverRouter   = require("./routes/waiver");
const stripeWebhook  = require("./routes/stripeWebhook");
const settingsRouter = require("./routes/settings");
const teachersRouter = require("./routes/teachers");
const venuesRouter   = require("./routes/venues");
const merchRouter    = require("./routes/merch");
const couponsRouter  = require("./routes/coupons");

const app = express();

// ── Rate limiting ──────────────────────────────────────────
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

app.use(cors({
  origin: [process.env.CLIENT_ORIGIN, "http://localhost:3000"],
}));

// !! Must be before express.json() — Stripe needs the raw body for signature verification
app.use("/api/stripe", stripeWebhook);

app.use(express.json());

app.use("/api/students",  studentRoutes);
app.use("/api/passes",    passRoutes);
app.use("/api/bookings",  bookingRoutes);
app.use("/api/acuity",    acuityRoutes);
app.use("/api/payments",  paymentsRouter);
app.use("/api/schedule",  scheduleRouter);
app.use("/api/reports",   reportsRouter);
app.use("/api/waiver",    waiverRouter);
app.use("/api/settings",  settingsRouter);
app.use("/api/teachers",  teachersRouter);
app.use("/api/venues",    venuesRouter);
app.use("/api/merch",     merchRouter);
app.use("/api/coupons",   couponsRouter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✓ MongoDB connected");
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });