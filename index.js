require("dotenv").config();
const express       = require("express");
const mongoose      = require("mongoose");
const cors          = require("cors");
const studentRoutes = require("./routes/students");
const passRoutes    = require("./routes/passes");
const bookingRoutes = require("./routes/bookings");
const acuityRoutes  = require("./routes/acuity");
const paymentsRouter = require("./routes/payments");
const reportsRouter = require("./routes/reports");
const scheduleRouter = require("./routes/schedule");
const waiverRouter = require("./routes/waiver");

const app = express();

app.use(cors({
  origin: [process.env.CLIENT_ORIGIN, "http://localhost:3000"],
}));
app.use(express.json());

app.use("/api/students",  studentRoutes);
app.use("/api/passes",    passRoutes);
app.use("/api/bookings",  bookingRoutes);
app.use("/api/acuity",    acuityRoutes);
app.use("/api/payments",  paymentsRouter);
app.use("/api/schedule",  scheduleRouter);
app.use("/api/reports",   reportsRouter);
app.use("/api/waiver",    waiverRouter);

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