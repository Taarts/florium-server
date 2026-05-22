const express   = require("express");
const router    = express.Router();
const Booking   = require("../models/Booking");
const Pass      = require("../models/Pass");
const Student   = require("../models/Student");
const adminAuth = require("../middleware/auth");

const {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendWorkshopConfirmationEmail,
  sendRescheduleEmail,
  sendClassCancelledEmail,
  sendPrivatePassPromptEmail,
} = require("../email");
 
// ── Mirrors CLASS_DETAILS in email.js ─────────────────────
// Used for 60-min cutoff checks. Keep in sync if classes change.
const CLASS_DETAILS = {
  cls_mon: { title: "Iyengar Yoga",          day: "Monday",    time: "10:00", duration: 90 },
  cls_wed: { title: "Iyengar Yoga",          day: "Wednesday", time: "18:00", duration: 75 },
  cls_fri: { title: "Iyengar Yoga",          day: "Friday",    time: "10:00", duration: 90 },
  cls_sat: { title: "Iyengar Yoga — Online", day: "Saturday",  time: "08:15", duration: 90 },
  cls_sun: { title: "Iyengar Yoga — Online", day: "Sunday",    time: "10:00", duration: 90 },
};
 
// Returns true if the class start is more than 60 minutes away
function isWithinCutoff(date, classId) {
  const cls = CLASS_DETAILS[classId];
  if (!cls) return false; // unknown class — allow cancel (safe default)
  const start = new Date(`${date}T${cls.time}:00`);
  const minsUntil = (start - Date.now()) / 60000;
  return minsUntil < 60;
}
 
// Generates a CREDIT-XXXX style pass code
function generateCreditCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CREDIT-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
 
// ── POST /api/bookings/workshop ───────────────────────────
router.post("/workshop", async (req, res) => {
  const { name, email, workshopId, workshopTitle, sessions, totalPrice, paymentType, stripePaymentId } = req.body;
  if (!name || !email || !workshopId || !sessions?.length || !totalPrice) {
    return res.status(400).json({ error: "Missing required workshop booking fields" });
  }
  try {
    await Student.findOneAndUpdate({ email }, { name, email }, { upsert: true, new: true });
    const saved = [];
    for (const session of sessions) {
      const booking = new Booking({
        studentEmail:    email,
        studentName:     name,
        classId:         `${workshopId}__${session.id}`,
        date:            session.date,
        paymentType:     paymentType ?? "dropin",
        stripePaymentId: stripePaymentId ?? null,
        workshopTitle:   workshopTitle, 
        status:          "confirmed",
      });
      await booking.save();
      saved.push(booking);
    }
    await sendWorkshopConfirmationEmail({ name, email, workshopTitle, sessions, totalPrice });
    res.json({ success: true, bookings: saved });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "You already have a booking for one or more of these sessions." });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
 router.post('/private', adminAuth, async (req, res) => {
  try {
    const { name, email, className, date, time, duration } = req.body;

    if (!name || !email || !className || !date || !time || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find an active private pass for this student
    const privatePassTypes = ['private1', 'private3', 'private10'];
    const now = new Date();

    const pass = await Pass.findOne({
        studentEmail: email,
        type: { $in: privatePassTypes },
        active: true,
        $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    }).then(async (p) => {
      // Also check classesUsed < classesTotal (not stored as Decimal128, just Numbers)
      if (!p) return null;
      const remaining = p.classesTotal - p.classesUsed;
      return remaining > 0 ? p : null;
    });

    if (!pass) {
      // No valid private pass — send prompt email, do not book
      await sendPrivatePassPromptEmail({
        studentName: name,
        studentEmail: email,
        className,
        date,
        time,
        duration,
      });

      return res.status(402).json({
        needsPass: true,
        message: `No active private pass found for ${email}. A payment prompt email has been sent.`,
      });
    }

    // Upsert student record
    await Student.findOneAndUpdate(
      { email },
      { name, email },
      { upsert: true, new: true }
    );

    // Build a classId for private bookings — namespaced to avoid clashes
    const classId = `private__${date}__${time.replace(/[: ]/g, '')}`;

    // Check for duplicate
    const existing = await Booking.findOne({ studentEmail: email, classId, date, status: 'confirmed' });
    if (existing) {
      return res.status(409).json({ error: 'A confirmed booking already exists for this student at this time.' });
    }

    // Save booking
    const booking = await Booking.create({
      studentEmail: email,
      studentName: name,
      classId,
      date,
      paymentType: pass.type,
      passId: pass._id,
      status: 'confirmed',
    });

    // Redeem one class from the pass
    await Pass.findByIdAndUpdate(pass._id, { $inc: { classesUsed: 1 } });
    const classesRemaining = pass.classesTotal - pass.classesUsed - 1;

    // Send standard confirmation email
    // Build a minimal cls object that matches what sendBookingConfirmation expects
    const cls = {
      title: className,
      time,
      duration,
      venue: 'Private class — location TBC',
      isOnline: false,
    };

    await sendBookingConfirmation({
      name,
      email,
      cls,
      date,
      paymentType: pass.type,
      classesRemaining,
      bookingId: booking._id,
    });

    return res.status(201).json({
      success: true,
      bookingId: booking._id,
      classesRemaining,
      message: 'Private class booked and confirmation email sent.',
    });

  } catch (err) {
    console.error('POST /api/bookings/private error:', err);
    return res.status(500).json({ error: 'Server error — private booking failed.' });
  }
});

// ── POST /api/bookings ────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const { name, email, classId, date, paymentType, passId, stripePaymentId } = req.body;
 
    if (!name || !email || !classId || !date || !paymentType)
      return res.status(400).json({ error: "Missing required booking fields." });
 
    await Student.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { name },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
 
    let pass = null;
    if (passId) {
      pass = await Pass.findById(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found." });
      const { valid, reason } = pass.isValid();
      if (!valid) return res.status(400).json({ valid: false, reason });
    }
 
    const booking = await Booking.create({
      studentEmail:    email.toLowerCase().trim(),
      studentName:     name,
      classId,
      date,
      paymentType,
      passId:          passId || null,
      stripePaymentId: stripePaymentId || null,
    });
 
    let classesRemaining = null;
    if (pass) {
      pass.classesUsed += 1;
      if (pass.classesTotal !== null && pass.classesUsed >= pass.classesTotal) pass.active = false;
      await pass.save();
      classesRemaining = pass.classesRemaining;
    }
 
    sendBookingConfirmation({ name, email, classId, date, paymentType, classesRemaining, bookingId: booking._id, });
 
    res.status(201).json({ success: true, booking, classesRemaining });
 
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "You already have a booking for this class on this date." });
    next(err);
  }
});
 
// ── GET /api/bookings ─────────────────────────────────────
// Admin: list bookings, filterable by classId, date, email
router.get("/", adminAuth, async (req, res, next) => {
  try {
    const { classId, date, email } = req.query;
    const filter = {};
    if (classId) filter.classId = classId;
    if (date)    filter.date    = date;
    if (email)   filter.studentEmail = email.toLowerCase().trim();
 
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    const confirmedCount = bookings.filter(b => b.status === "confirmed").length;
// Add waiver status to each booking
    const studentEmails = [...new Set(bookings.map(b => b.studentEmail))];
    const studentWaivers = await Student.find(
      { email: { $in: studentEmails } },
      { email: 1, waiverSigned: 1 }
    );
    const waiverMap = Object.fromEntries(
      studentWaivers.map(s => [s.email, s.waiverSigned])
    );
    const bookingsWithWaiver = bookings.map(b => ({
      ...b.toObject(),
      waiverSigned: waiverMap[b.studentEmail] ?? false,
    }));

    res.json({ bookings: bookingsWithWaiver, confirmedCount });
  } catch (err) {
    next(err);
  }
});
 
// ── GET /api/bookings/student/:email ──────────────────────
// Public: student booking history
router.get("/student/:email", async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      studentEmail: req.params.email.toLowerCase().trim()
    }).sort({ date: -1 });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});
 
// ── PATCH /api/bookings/:id/cancel ────────────────────────
// Admin: cancel a single booking + restore pass credit
// If the booking is a drop-in, a 1-class credit pass is created automatically.
router.patch("/:id/cancel", adminAuth, async (req, res, next) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: "Booking not found." });
 
    let creditCode = null;
 
    if (booking.passId) {
      // Pass holder — restore the class credit
      await Pass.findByIdAndUpdate(booking.passId, { $inc: { classesUsed: -1 } });
    } else if (booking.paymentType === "dropin") {
      // Drop-in — create a 1-class credit pass (no refund, per policy)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      creditCode = generateCreditCode();
      await Pass.create({
        code:          creditCode,
        type:          "dropin",
        studentEmail:  booking.studentEmail,
        classesTotal:  1,
        classesUsed:   0,
        expiresAt,
        active:        true,
        notes:         `Credit issued for cancelled booking on ${booking.date}`,
      });
    }
 
    sendCancellationEmail({
      email:      booking.studentEmail,
      name:       booking.studentName,
      classId:    booking.classId,
      date:       booking.date,
      creditCode, // null for pass holders; email template handles both cases
    });
 
    res.json({ success: true, booking, creditCode });
  } catch (err) {
    next(err);
  }
});
 
// ── PATCH /api/bookings/:id/cancel-class ─────────────────
// Admin: cancel an entire class date — affects ALL confirmed bookings for
// that classId + date. Pass holders get credit restored; drop-ins get a
// 1-class credit pass. No Stripe refunds issued (per policy).
router.patch("/cancel-class", adminAuth, async (req, res, next) => {
  try {
    const { classId, date } = req.body;
    if (!classId || !date)
      return res.status(400).json({ error: "classId and date are required." });
 
    const bookings = await Booking.find({ classId, date, status: "confirmed" });
    if (!bookings.length)
      return res.json({ success: true, affected: 0 });
 
    const results = [];
 
    for (const booking of bookings) {
      await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" });
 
      let creditCode = null;
 
      if (booking.passId) {
        await Pass.findByIdAndUpdate(booking.passId, { $inc: { classesUsed: -1 } });
      } else if (booking.paymentType === "dropin") {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);
        creditCode = generateCreditCode();
        await Pass.create({
          code:         creditCode,
          type:         "dropin",
          studentEmail: booking.studentEmail,
          classesTotal: 1,
          classesUsed:  0,
          expiresAt,
          active:       true,
          notes:        `Credit issued — class cancelled by admin on ${date}`,
        });
      }
 
      sendClassCancelledEmail({
        email:      booking.studentEmail,
        name:       booking.studentName,
        classId:    booking.classId,
        date:       booking.date,
        creditCode,
      });
 
      results.push({ bookingId: booking._id, email: booking.studentEmail, creditCode });
    }
 
    res.json({ success: true, affected: results.length, results });
  } catch (err) {
    next(err);
  }
});
 
// ── PATCH /api/bookings/:id/reschedule ───────────────────
// Admin: move a booking to a different class/date.
// Payment type and pass linkage are preserved — no charge or refund.
router.patch("/:id/reschedule", adminAuth, async (req, res, next) => {
  try {
    const { newClassId, newDate } = req.body;
    if (!newClassId || !newDate)
      return res.status(400).json({ error: "newClassId and newDate are required." });
 
    const booking = await Booking.findById(req.params.id);
    if (!booking)       return res.status(404).json({ error: "Booking not found." });
    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "Only confirmed bookings can be rescheduled." });
 
    // Duplicate check on the new slot
    const clash = await Booking.findOne({
      studentEmail: booking.studentEmail,
      classId:      newClassId,
      date:         newDate,
      status:       "confirmed",
    });
    if (clash)
      return res.status(409).json({ error: "Student already has a confirmed booking for that class on that date." });
 
    const oldClassId = booking.classId;
    const oldDate    = booking.date;
 
    booking.classId = newClassId;
    booking.date    = newDate;
    await booking.save();
 
    sendRescheduleEmail({
      email:      booking.studentEmail,
      name:       booking.studentName,
      classId:    newClassId,
      date:       newDate,
      oldClassId,
      oldDate,
    });
 
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
});
 
// ── PATCH /api/bookings/:id/reschedule-student ───────────
// Public: student self-reschedule from My Bookings page or email link.
// Validates:
//   - email matches the booking (ownership check)
//   - booking is confirmed
//   - current class is not within 60-min cutoff
//   - new slot has no duplicate confirmed booking
// NOTE: pass expiry is deliberately NOT checked — the class credit was
// already paid for; rescheduling to a date after expiry is allowed.
router.patch("/:id/reschedule-student", async (req, res, next) => {
  try {
    const { email, newClassId, newDate } = req.body;
    if (!email || !newClassId || !newDate)
      return res.status(400).json({ error: "email, newClassId, and newDate are required." });
 
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
 
    // Ownership check
    if (booking.studentEmail !== email.toLowerCase().trim())
      return res.status(403).json({ error: "That booking doesn't match this email address." });
 
    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "Only confirmed bookings can be rescheduled." });
 
    // 60-min cutoff on the CURRENT class (can't reschedule after the window closes)
    if (isWithinCutoff(booking.date, booking.classId))
      return res.status(400).json({ error: "Bookings cannot be changed within 60 minutes of the class start time." });
 
    // Duplicate check on the new slot
    const clash = await Booking.findOne({
      studentEmail: email.toLowerCase().trim(),
      classId:      newClassId,
      date:         newDate,
      status:       "confirmed",
    });
    if (clash)
      return res.status(409).json({ error: "You already have a booking for that class on that date." });
 
    const oldClassId = booking.classId;
    const oldDate    = booking.date;
 
    booking.classId = newClassId;
    booking.date    = newDate;
    await booking.save();
 
    sendRescheduleEmail({
      email:      booking.studentEmail,
      name:       booking.studentName,
      classId:    newClassId,
      date:       newDate,
      oldClassId,
      oldDate,
    });
 
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
});
 
// ── PATCH /api/bookings/:id/cancel-student ───────────────
// Public: student self-cancel from My Bookings page or email link.
// Validates:
//   - email matches the booking (ownership check)
//   - booking is confirmed
//   - not within 60-min cutoff
// Pass credit is restored if applicable. Drop-ins receive no refund or
// credit (they chose to cancel — contrast with admin cancelling a class).
router.patch("/:id/cancel-student", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ error: "email is required." });
 
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
 
    // Ownership check
    if (booking.studentEmail !== email.toLowerCase().trim())
      return res.status(403).json({ error: "That booking doesn't match this email address." });
 
    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "This booking is not confirmed." });
 
    // 60-min cutoff
    if (isWithinCutoff(booking.date, booking.classId))
      return res.status(400).json({ error: "Bookings cannot be cancelled within 60 minutes of the class start time." });
 
    await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" });
 
    // Restore pass credit if applicable
    if (booking.passId) {
      await Pass.findByIdAndUpdate(booking.passId, { $inc: { classesUsed: -1 } });
    }
    // Drop-in self-cancel: no credit, no refund (per policy)
 
    sendCancellationEmail({
      email:      booking.studentEmail,
      name:       booking.studentName,
      classId:    booking.classId,
      date:       booking.date,
      creditCode: null,
    });
 
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
 
module.exports = router;
