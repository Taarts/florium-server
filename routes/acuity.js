const express = require("express");
const router  = express.Router();
const axios   = require("axios");

// Acuity Basic Auth helper
const acuityAuth = () => ({
  auth: {
    username: process.env.ACUITY_USER_ID,
    password: process.env.ACUITY_API_KEY,
  },
});

const ACUITY_BASE = "https://acuityscheduling.com/api/v1";

// ── GET /api/acuity/availability ──────────────────────────
// Returns available slots for a given appointmentTypeID and date.
// Used to verify a class slot is still open before booking.
router.get("/availability", async (req, res, next) => {
  try {
    const { appointmentTypeID, date } = req.query;
    if (!appointmentTypeID || !date)
      return res.status(400).json({ error: "appointmentTypeID and date are required." });

    const response = await axios.get(`${ACUITY_BASE}/availability/times`, {
      params: { appointmentTypeID, date },
      ...acuityAuth(),
    });

    res.json(response.data);
  } catch (err) {
    console.error("Acuity availability error:", err.response?.data || err.message);
    next(err);
  }
});

// ── GET /api/acuity/appointment-types ─────────────────────
// Returns all appointment types — useful for admin/debugging.
router.get("/appointment-types", async (req, res, next) => {
  try {
    const response = await axios.get(
      `${ACUITY_BASE}/appointment-types`,
      acuityAuth()
    );
    res.json(response.data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/acuity/appointments ──────────────────────────
// Returns upcoming appointments from Acuity — for cross-referencing
// with local bookings DB.
router.get("/appointments", async (req, res, next) => {
  try {
    const { minDate, maxDate, email } = req.query;
    const response = await axios.get(`${ACUITY_BASE}/appointments`, {
      params: { minDate, maxDate, email },
      ...acuityAuth(),
    });
    res.json(response.data);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/acuity/appointments/:id ───────────────────
// Cancels an Acuity appointment by ID.
// Called when admin cancels a booking that has an acuityAppointmentId.
router.delete("/appointments/:id", async (req, res, next) => {
  try {
    const response = await axios.put(
      `${ACUITY_BASE}/appointments/${req.params.id}/cancel`,
      {},
      acuityAuth()
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("Acuity cancel error:", err.response?.data || err.message);
    next(err);
  }
});

module.exports = router;
