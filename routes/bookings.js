const express           = require("express");
const router            = express.Router();
const Booking           = require("../models/Booking");
const Pass              = require("../models/Pass");
const Student           = require("../models/Student");
const adminAuth         = require("../middleware/auth");
const { requireAuth } = require("../middleware/auth");
const { canAccessClass } = require("../middleware/scope");
const staffAuth = requireAuth("owner", "teacher");
const Settings          = require("../models/Settings");
const Class             = require("../models/Class");
const Waitlist          = require("../models/Waitlist");
const Cancellation      = require("../models/Cancellation");
const { validateEmail } = require("../utils/validateEmail");
const { minutesUntil }        = require("../utils/classTime");
const { verifyDropinPayment } = require("../utils/classPayment");
const { joinWaitlist, leaveWaitlist, promoteWaitlist, expireOffers, takenCount } = require("../utils/waitlist");

// Booking types a pass can pay for (Booking.paymentType enum minus drop-in/teacher)
const PASS_BOOKING_TYPES = Booking.schema.path("paymentType").enumValues.filter(t => !["dropin", "teacher"].includes(t));
// A booking left this class/date: email the next person on its waitlist (never blocks the response)
const spotOpened = (classId, date) =>
  promoteWaitlist(classId, date).catch(err => console.error("✗ waitlist promote:", err.message));

const {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendWorkshopConfirmationEmail,
  sendRescheduleEmail,
  sendClassCancelledEmail,
  sendPrivatePassPromptEmail,
  sendAdminBookingAlert,
  sendAdminCancellationAlert,
} = require("../email");

// Returns true if the class start is within 60 minutes
async function isWithinCutoff(date, classId) {
  try {
    const cls = await Class.findOne({ id: classId });
    if (!cls) return false;
    const minsUntil = minutesUntil(date, cls.time); // studio time zone, not the server's
    return minsUntil != null && minsUntil < 60;
  } catch {
    return false;
  }
}

// Generates a CREDIT-XXXX style pass code
function generateCreditCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CREDIT-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Fire-and-forget admin notification — never blocks the response
async function notifyAdminBooking({ studentName, studentEmail, cls, date, paymentType, classesRemaining }) {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.adminEmail || settings.notificationMode !== "per-booking") return;
    sendAdminBookingAlert({ adminEmail: settings.adminEmail, studentName, studentEmail, cls, date, paymentType, classesRemaining });
  } catch {}
}

async function notifyAdminCancellation({ studentName, studentEmail, classId, date, paymentType }) {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.adminEmail) return;
    const cls = await Class.findOne({ id: classId });
    sendAdminCancellationAlert({ adminEmail: settings.adminEmail, studentName, studentEmail, cls: cls?.toObject() || null, date, paymentType });
  } catch {}
}


// ── GET /api/bookings/capacity?classId=&date=[&email=] ────
// Spots taken = confirmed bookings + spots held for the waitlist. If email is given,
// that person's own held spot doesn't count, so they can book it.
router.get("/capacity", async (req, res, next) => {
  try {
    const { classId, date, email } = req.query;
    if (!classId || !date) return res.status(400).json({ error: "classId and date required" });
    const cls = await Class.findOne({ id: classId });
    if (!cls || !cls.cap) return res.json({ isFull: false, spotsLeft: null, waitlistEnabled: false, waitlistCount: 0 });
    await expireOffers({ classId, date });
    const taken = await takenCount(classId, date, email || null);
    const waitlistCount = cls.waitlistEnabled ? await Waitlist.countDocuments({ classId, date }) : 0;
    res.json({ isFull: taken >= cls.cap, spotsLeft: Math.max(0, cls.cap - taken), cap: cls.cap,
               waitlistEnabled: cls.waitlistEnabled || false, waitlistCount });
  } catch (err) { next(err); }
});

// ── GET /api/bookings/availability?from=YYYY-MM-DD&to=YYYY-MM-DD ──
// Spots taken per class date, for the "N spaces left" labels on the schedule.
// Returns { taken: { "<classId>__<date>": n } } for capped classes only; the schedule
// already knows each class's cap.
router.get("/availability", async (req, res, next) => {
  try {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to } = req.query;
    if (!re.test(from || "") || !re.test(to || "") || to < from)
      return res.status(400).json({ error: "from and to (YYYY-MM-DD) required" });
    const capped = await Class.find({ cap: { $gt: 0 } }, { id: 1 }).lean();
    const ids = capped.map(c => c.id);
    if (!ids.length) return res.json({ taken: {} });
    const [booked, held] = await Promise.all([
      Booking.aggregate([
        { $match: { classId: { $in: ids }, date: { $gte: from, $lte: to }, status: "confirmed" } },
        { $group: { _id: { c: "$classId", d: "$date" }, n: { $sum: 1 } } },
      ]),
      Waitlist.aggregate([
        { $match: { classId: { $in: ids }, date: { $gte: from, $lte: to }, status: "offered", holdUntil: { $gt: new Date() } } },
        { $group: { _id: { c: "$classId", d: "$date" }, n: { $sum: 1 } } },
      ]),
    ]);
    const taken = {};
    for (const r of [...booked, ...held]) {
      const k = `${r._id.c}__${r._id.d}`;
      taken[k] = (taken[k] || 0) + r.n;
    }
    res.set("Cache-Control", "no-store");
    res.json({ taken });
  } catch (err) { next(err); }
});
// ── POST /api/bookings/admin-add ──────────────────────────
// Cancellations store Class _id; bookings use Class.id ("class_...") — check both
async function isClassCancelled(classId, date) {
  const cid = String(classId);
  const ids = [cid];
  const cls = /^[a-f0-9]{24}$/i.test(cid)
    ? await Class.findOne({ $or: [{ id: cid }, { _id: cid }] })
    : await Class.findOne({ id: cid });
  if (cls) ids.push(String(cls._id), String(cls.id));
  return !!(await Cancellation.exists({ classId: { $in: ids }, date }));
}

router.post("/admin-add", staffAuth, async (req, res) => {
  try {
    const { studentName, studentEmail, classId, date, paymentType, passCode } = req.body;
    if (!(await canAccessClass(req.user, classId)))
      return res.status(403).json({ error: "That class isn't one of yours." });
    if (!studentName || !studentEmail || !classId || !date || !paymentType) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    if (await isClassCancelled(classId, date))
      return res.status(409).json({ error: "This class is cancelled on that date." });
    
    const emailCheck = await validateEmail(studentEmail);
    if (!emailCheck.valid)
      return res.status(400).json({ error: emailCheck.reason });

    await Student.findOneAndUpdate(
      { email: studentEmail.toLowerCase() },
      { $setOnInsert: { name: studentName, email: studentEmail.toLowerCase(), createdAt: new Date() } },
      { upsert: true, new: true }
    );

    let passId = null;
    let pass   = null;
    if (passCode) {
      pass = await Pass.findOne({ code: passCode.toUpperCase(), active: true });
      if (!pass) return res.status(404).json({ error: `Pass code ${passCode} not found or inactive.` });
      if (pass.studentEmail !== studentEmail.toLowerCase().trim())
        return res.status(403).json({ error: `Pass ${pass.code} belongs to a different student.` });
    } else if (paymentType !== "dropin") {
      if (String(paymentType).startsWith("private"))
        return res.status(400).json({ error: "Private passes cannot be used to book group classes." });
      pass = await Pass.findOne({ studentEmail: studentEmail.toLowerCase(), active: true, code: { $not: /^PRIV-/ } })
        .sort({ createdAt: -1 });
      if (!pass)
        return res.status(409).json({ error: "This student has no active pass. Choose Drop-in or add a pass first." });
    }
    if (pass) {
      if (pass.code.startsWith('PRIV-')) return res.status(400).json({ error: 'Private passes cannot be used to book group classes.' });
      passId = pass._id;
    }

    let consumedPass = null;
    if (passId) {
      consumedPass = await Pass.consume(passId, 1);
      if (!consumedPass)
        return res.status(409).json({ error: `Pass ${pass.code} has no classes remaining. Book as a drop-in or add a new pass.` });
    }

    const booking = new Booking({
      studentName,
      studentEmail: studentEmail.toLowerCase(),
      classId,
      date,
      paymentType,
      passId: passId || null,
      status: "confirmed",
      checkedIn: false,
    });
    try {
      await booking.save();
    } catch (e) {
      if (passId) await Pass.release(passId, 1);
      throw e;
    }

    let classesRemaining;
    if (consumedPass && consumedPass.classesTotal != null) {
      classesRemaining = consumedPass.classesTotal - consumedPass.classesUsed;
    }

    const classDoc = await Class.findOne({ id: classId });
    sendBookingConfirmation({
      name: studentName,
      email: studentEmail,
      classId,
      date,
      paymentType,
      classesRemaining,
      bookingId: booking._id,
      cls: classDoc?.toObject() || null,
    }).catch(err => console.error("admin-add confirmation email failed:", err));

    res.json({ success: true, booking });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "This student already has a confirmed booking for this class on this date." });
    }
    console.error("admin-add booking error:", err);
    res.status(500).json({ error: "Failed to add booking." });
  }
});

// ── POST /api/bookings/workshop ───────────────────────────
// Price comes from the Workshop record (never from the browser), and the Stripe
// payment must have succeeded, be recent, cover that price and not be reused.
router.post("/workshop", async (req, res) => {
  const { name, email, workshopId, sessions, paymentType, stripePaymentId } = req.body;
  if (!name || !email || !workshopId || !Array.isArray(sessions) || !sessions.length) {
    return res.status(400).json({ error: "Missing required workshop booking fields" });
  }
  try {
    const Workshop = require("../models/Workshop");
    const workshop = await Workshop.findOne({ id: workshopId }).lean();
    if (!workshop) return res.status(404).json({ error: "Workshop not found." });

    // Resolve each requested session ("<dayIndex>__<sessionId>") against the workshop
    const resolved = [];
    const seen = new Set();
    for (const s of sessions) {
      const key = String((s && s.id) || "");
      const sep = key.indexOf("__");
      const di  = sep > 0 ? Number(key.slice(0, sep)) : NaN;
      const day = Number.isInteger(di) ? (workshop.days || [])[di] : null;
      const sess = day && (day.sessions || []).find(x => x.id === key.slice(sep + 2));
      if (!sess || (s.date && s.date !== day.date) || seen.has(key)) {
        return res.status(400).json({ error: "One or more sessions don't belong to this workshop." });
      }
      seen.add(key);
      resolved.push({ id: key, date: day.date, label: sess.label, time: sess.time, price: Number(sess.price) || 0 });
    }

    const totalSessions  = (workshop.days || []).reduce((n, d) => n + ((d.sessions || []).length), 0);
    const isFull         = resolved.length === totalSessions;
    const singlesAllowed = (workshop.kind || "workshop") === "workshop" || workshop.allowSingle !== false;
    if (!isFull && !singlesAllowed) {
      return res.status(400).json({ error: "This is sold as a full package only." });
    }
    const sum  = resolved.reduce((n, r) => n + r.price, 0);
    const full = Number(workshop.pricing && workshop.pricing.fullWorkshop) || 0;
    const totalPrice    = isFull && full > 0 ? Math.min(full, sum > 0 ? sum : full) : sum;
    const requiredCents = Math.round(totalPrice * 100);

    if (requiredCents > 0) {
      if (!stripePaymentId || typeof stripePaymentId !== "string") {
        return res.status(402).json({ error: "Payment is required for this booking." });
      }
      if (await Booking.exists({ stripePaymentId })) {
        return res.status(409).json({ error: "This payment has already been used for a booking." });
      }
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      let pi;
      try { pi = await stripe.paymentIntents.retrieve(stripePaymentId); }
      catch (e) { return res.status(402).json({ error: "Payment could not be verified." }); }
      const ageSec = Math.floor(Date.now() / 1000) - (pi.created || 0);
      if (pi.status !== "succeeded" || (pi.amount_received || 0) < requiredCents || ageSec > 3600) {
        console.warn(`✗ workshop ${workshopId}: payment ${stripePaymentId} status=${pi.status} received=${pi.amount_received} required=${requiredCents} age=${ageSec}s email=${email}`);
        return res.status(402).json({ error: "Payment doesn't cover this booking." });
      }
    }

    await Student.findOneAndUpdate({ email }, { name, email }, { upsert: true, new: true });
    const saved = [];
    for (const session of resolved) {
      const booking = new Booking({
        studentEmail:    email,
        studentName:     name,
        classId:         `${workshopId}__${session.id}`,
        date:            session.date,
        paymentType:     paymentType ?? "dropin",
        stripePaymentId: stripePaymentId ?? null,
        workshopTitle:   workshop.title,
        status:          "confirmed",
      });
      await booking.save();
      saved.push(booking);
    }
    await sendWorkshopConfirmationEmail({ name, email, workshopTitle: workshop.title, sessions: resolved, totalPrice });
    res.json({ success: true, bookings: saved });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "You already have a booking for one or more of these sessions." });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/bookings/private ────────────────────────────
router.post("/private", adminAuth, async (req, res) => {
  try {
    const { name, email, className, dates, date, time, duration, location } = req.body;
    const dateList = dates ?? (date ? [date] : []);

    if (!name || !email || !className || !dateList.length || !time || !duration) {
        return res.status(400).json({ error: "Missing required fields" });
      }

    const privatePassTypes = ["private1", "private3", "private10"];
    const now = new Date();

    const pass = await Pass.findOne({
  studentEmail: email,
  type:         { $in: privatePassTypes },
  active:       true,
  $expr:        { $gt: ["$classesTotal", "$classesUsed"] },
  $or: [
    { expiresAt: null },
    { expiresAt: { $gt: now } },
  ],
})

    if (!pass) {
      await sendPrivatePassPromptEmail({ studentName: name, studentEmail: email, className, date, time, duration });
      return res.status(402).json({
        needsPass: true,
        message: `No active private pass found for ${email}. A payment prompt email has been sent.`,
      });
    }

    await Student.findOneAndUpdate({ email }, { name, email }, { upsert: true, new: true });

   const venueLabel = location === "online" ? "Online — Zoom link sent on booking"
      : location === "home" ? "Student's home"
      : location === "other" ? "Other location"
      : "In studio";

    const bookings = [];
    for (const d of dateList) {
      const classId  = `private__${d}__${time.replace(/[: ]/g, "")}`;
      const existing = await Booking.findOne({ studentEmail: email, classId, date: d, status: "confirmed" });
      if (existing) continue;

        const booking = await Booking.create({
        studentEmail: email,
        studentName:  name,
        classId,
        date:         d,
        time,
        duration,
        location,
        paymentType:  pass.type,
        passId:       pass._id,
        status:       "confirmed",
      });
      bookings.push(booking);
    }

    if (!bookings.length) {
      return res.status(409).json({ error: "All selected dates already have a confirmed booking." });
    }

    const consumed = await Pass.consume(pass._id, bookings.length);
    if (!consumed) {
      await Booking.deleteMany({ _id: { $in: bookings.map(b => b._id) } });
      const left = pass.classesTotal == null ? null : Math.max(0, pass.classesTotal - pass.classesUsed);
      return res.status(409).json({ error: `Not enough classes left on this pass${left != null ? ` (${left} remaining)` : ""}.` });
    }
    const classesRemaining = consumed.classesTotal == null ? null : consumed.classesTotal - consumed.classesUsed;

    const cls = { title: className, time, duration, venue: venueLabel, isOnline: location === "online" };
    await sendBookingConfirmation({ name, email, cls, date: dateList[0], paymentType: pass.type, classesRemaining, bookingId: bookings[0]._id });

    return res.status(201).json({ success: true, booked: bookings.length, classesRemaining });

        } catch (err) {
          console.error("POST /private error:", err);
          res.status(500).json({ error: "Failed to create private booking." });
        }
      });

// ── POST /api/bookings ────────────────────────────────────
// ── POST /api/bookings/teacher — signed-in teachers book themselves free ──
router.post("/teacher", staffAuth, async (req, res, next) => {
  try {
    const { classId, date } = req.body;
    if (!classId || !date)
      return res.status(400).json({ error: "Missing class or date." });

    if (await isClassCancelled(classId, date))
      return res.status(409).json({ error: "This class has been cancelled and can no longer be booked." });

    const freeCls = await Class.findOne({ id: classId }).lean();
    if (freeCls && /therap/i.test(freeCls.title || ""))
      return res.status(403).json({ error: "Therapy classes aren't included in free teacher access." });

    const User    = require("../models/User");
    const Teacher = require("../models/Teacher");
    const user    = await User.findById(req.user.id).lean();
    const teacher = user?.teacherId ? await Teacher.findById(user.teacherId).lean() : null;

    if (req.user.role === "teacher" && (!teacher || !teacher.active))
      return res.status(403).json({ error: "Your teacher profile is not active." });

    const email = String(teacher?.email || user?.email || req.user.email || "").toLowerCase().trim();
    const name  = teacher?.name || user?.name || req.user.name || email;
    if (!email)
      return res.status(400).json({ error: "No email on your account." });

    await Student.findOneAndUpdate(
      { email },
      { name },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const booking = await Booking.create({
      studentEmail: email,
      studentName:  name,
      classId,
      date,
      paymentType:  "teacher",
    });

    const classDoc = await Class.findOne({ id: classId });
    sendBookingConfirmation({ name, email, classId, date, paymentType: "teacher", classesRemaining: null, bookingId: booking._id, cls: classDoc?.toObject() || null });

    res.status(201).json({ success: true, booking });

    notifyAdminBooking({ studentName: name, studentEmail: email, cls: classDoc?.toObject() || null, date, paymentType: "teacher", classesRemaining: null });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "You already have a booking for this class on this date." });
    next(err);
  }
});

// Public class booking. paymentType:
//   "dropin"   → stripePaymentId must be a verified Stripe payment covering this class
//   "waitlist" → join the class waitlist (class must be full, waitlist on); no booking made
//   otherwise  → passId required; the pass decides the booking type
router.post("/", async (req, res, next) => {
  try {
    const { name, email, phone, classId, date, passId, stripePaymentId, couponCode } = req.body;
    let { paymentType } = req.body;

    if (!name || !email || !classId || !date || !paymentType)
      return res.status(400).json({ error: "Missing required booking fields." });

    if (await isClassCancelled(classId, date))
      return res.status(409).json({ error: "This class has been cancelled and can no longer be booked." });

    const emailCheck = await validateEmail(email);
    if (!emailCheck.valid)
      return res.status(400).json({ error: emailCheck.reason });

    const cls = await Class.findOne({ id: classId });
    if (!cls) return res.status(404).json({ error: "Class not found." });
    const studentEmail = email.toLowerCase().trim();

    const studentUpdate = { name };
    if (phone && phone.trim()) studentUpdate.phone = phone.trim();
    await Student.findOneAndUpdate(
      { email: studentEmail },
      studentUpdate,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (paymentType === "waitlist") {
      const w = await joinWaitlist({ cls, date, email: studentEmail, name });
      if (!w.ok) return res.status(w.status).json({ error: w.error, spotAvailable: !!w.spotAvailable });
      return res.status(w.already ? 200 : 201).json({ waitlisted: true, position: w.position, already: !!w.already });
    }

    if (cls.cap) await expireOffers({ classId, date });
    // Spots held for the waitlist count as taken, except this student's own held spot
    const isFull = Boolean(cls.cap) && (await takenCount(classId, date, studentEmail)) >= cls.cap;

    let pass = null;
    let coupon = null;
    if (paymentType === "dropin") {
      const pay = await verifyDropinPayment({ cls, email: studentEmail, stripePaymentId, couponCode });
      if (!pay.ok) return res.status(pay.status).json({ error: pay.error });
      coupon = pay.coupon;
      // Paid while a spot showed as open: book anyway, even if the class just filled (decided 10-15).
      if (isFull) console.warn(`⚠ ${classId} ${date}: paid drop-in booked over cap ${cls.cap} (${studentEmail})`);
    } else {
      if (!passId) return res.status(400).json({ error: "Choose a pass to book with, or book as a drop-in." });
      if (isFull) {
        return res.status(409).json({
          error: cls.waitlistEnabled ? "This class is full. You can join the waitlist instead." : "This class is full.",
          full: true, waitlistEnabled: !!cls.waitlistEnabled,
        });
      }
      pass = await Pass.findById(passId);
      if (!pass) return res.status(404).json({ error: "Pass not found." });
      if (pass.studentEmail !== studentEmail)
        return res.status(403).json({ error: "This pass belongs to a different email address. Book with the email the pass was bought under." });
      const { valid, reason } = pass.isValid();
      if (!valid) return res.status(400).json({ valid: false, reason, error: reason });
      if (!PASS_BOOKING_TYPES.includes(pass.type) && pass.type !== "dropin")
        return res.status(400).json({ error: "This pass can't be used to book classes." });
      paymentType = pass.type; // the pass decides, not the browser

      if (pass.type === "memberUnl") {
        const existingToday = await Booking.findOne({
          studentEmail,
          date,
          status: { $ne: "cancelled" },
        });
        if (existingToday) {
          return res.status(400).json({ error: "Your Monthly membership allows one class per day. You already have a booking for this date." });
        }
      }
    }

    const booking = await Booking.create({
      studentEmail,
      studentName:     name,
      classId,
      date,
      paymentType,
      passId:          pass ? pass._id : null,
      stripePaymentId: paymentType === "dropin" && !pass ? (stripePaymentId || null) : null,
    });

    let classesRemaining = null;
    if (pass) {
      const consumed = await Pass.consume(pass._id, 1);
      if (!consumed) {
        await Booking.deleteOne({ _id: booking._id });
        return res.status(409).json({ error: "This pass has no classes remaining. Book as a drop-in or buy a new pass." });
      }
      classesRemaining = consumed.classesRemaining;
    }

    sendBookingConfirmation({ name, email: studentEmail, classId, date, paymentType, classesRemaining, bookingId: booking._id, cls: cls.toObject() });

    if (coupon) {
      const Coupon = require("../models/Coupon");
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
    }
    leaveWaitlist(classId, date, studentEmail).catch(() => {});

    res.status(201).json({ success: true, booking, classesRemaining });

    // Admin notification (after response sent)
    notifyAdminBooking({ studentName: name, studentEmail, cls: cls.toObject(), date, paymentType, classesRemaining });

  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "You already have a booking for this class on this date." });
    next(err);
  }
});

// ── GET /api/bookings ─────────────────────────────────────
router.get("/", staffAuth, async (req, res, next) => {
  try {
    const { classId, date, email } = req.query;
    if (req.user.role !== "owner" && !(await canAccessClass(req.user, classId)))
      return res.status(403).json({ error: "Forbidden" });
    const filter = {};
    if (classId) filter.classId = classId;
    if (date)    filter.date    = date;
    if (email)   filter.studentEmail = email.toLowerCase().trim();

    const bookings      = await Booking.find(filter).sort({ createdAt: -1 }).populate("passId");
    const confirmedCount = bookings.filter(b => b.status === "confirmed").length;

    const studentEmails  = [...new Set(bookings.map(b => b.studentEmail))];
    const studentWaivers = await Student.find({ email: { $in: studentEmails } }, { email: 1, waiverSigned: 1 });
    const waiverMap      = Object.fromEntries(studentWaivers.map(s => [s.email, s.waiverSigned]));

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
router.get("/student/:email", adminAuth, async (req, res, next) => {
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
      await Pass.release(booking.passId, 1);
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
        notes:        `Credit issued for cancelled booking on ${booking.date}`,
      });
    }

    sendCancellationEmail({ email: booking.studentEmail, name: booking.studentName, classId: booking.classId, date: booking.date, creditCode });

    res.json({ success: true, booking, creditCode });
    spotOpened(booking.classId, booking.date);

    // Admin notification
    notifyAdminCancellation({ studentName: booking.studentName, studentEmail: booking.studentEmail, classId: booking.classId, date: booking.date, paymentType: booking.paymentType });

  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bookings/cancel-class ─────────────────────
router.patch("/cancel-class", adminAuth, async (req, res, next) => {
  try {
    const { classId, date } = req.body;
    if (!classId || !date)
      return res.status(400).json({ error: "classId and date are required." });

    // The web calendar sends the Class _id; bookings store Class.id ("class_...") — match both
    const cid = String(classId);
    const cls = /^[a-f0-9]{24}$/i.test(cid)
      ? await Class.findOne({ $or: [{ id: cid }, { _id: cid }] }, "id").lean()
      : await Class.findOne({ id: cid }, "id").lean();
    const classIds = [...new Set([cid, ...(cls ? [String(cls._id), String(cls.id)] : [])])];
    const bookings = await Booking.find({ classId: { $in: classIds }, date, status: "confirmed" });
    if (!bookings.length)
      return res.json({ success: true, affected: 0 });

    const results = [];

    for (const booking of bookings) {
      await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" });

      let creditCode = null;

      if (booking.passId) {
        await Pass.release(booking.passId, 1);
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

      sendClassCancelledEmail({ email: booking.studentEmail, name: booking.studentName, classId: booking.classId, date: booking.date, creditCode });
      results.push({ bookingId: booking._id, email: booking.studentEmail, creditCode });
    }

    res.json({ success: true, affected: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bookings/:id/reschedule ───────────────────
router.patch("/:id/reschedule", adminAuth, async (req, res, next) => {
  try {
    const { newClassId, newDate } = req.body;
    if (!newClassId || !newDate)
      return res.status(400).json({ error: "newClassId and newDate are required." });

    const booking = await Booking.findById(req.params.id);
    if (!booking)
      return res.status(404).json({ error: "Booking not found." });
    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "Only confirmed bookings can be rescheduled." });

    const clash = await Booking.findOne({ studentEmail: booking.studentEmail, classId: newClassId, date: newDate, status: "confirmed" });
    if (clash)
      return res.status(409).json({ error: "Student already has a confirmed booking for that class on that date." });

    const oldClassId = booking.classId;
    const oldDate    = booking.date;

    booking.classId = newClassId;
    booking.date    = newDate;
    await booking.save();

    sendRescheduleEmail({ email: booking.studentEmail, name: booking.studentName, classId: newClassId, date: newDate, oldClassId, oldDate });

    res.json({ success: true, booking });
    spotOpened(oldClassId, oldDate);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bookings/:id/reschedule-student ───────────
router.patch("/:id/reschedule-student", async (req, res, next) => {
  try {
    const { email, newClassId, newDate } = req.body;
    if (!email || !newClassId || !newDate)
      return res.status(400).json({ error: "email, newClassId, and newDate are required." });

    if (await isClassCancelled(newClassId, newDate))
      return res.status(409).json({ error: "That class has been cancelled. Please choose another date." });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    if (booking.studentEmail !== email.toLowerCase().trim())
      return res.status(403).json({ error: "That booking doesn't match this email address." });

    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "Only confirmed bookings can be rescheduled." });

    if (await isWithinCutoff(booking.date, booking.classId))
      return res.status(400).json({ error: "Bookings cannot be changed within 60 minutes of the class start time." });

    const clash = await Booking.findOne({ studentEmail: email.toLowerCase().trim(), classId: newClassId, date: newDate, status: "confirmed" });
    if (clash)
      return res.status(409).json({ error: "You already have a booking for that class on that date." });

    const newCls = await Class.findOne({ id: newClassId });
    if (newCls?.cap && (await takenCount(newClassId, newDate, email)) >= newCls.cap)
      return res.status(409).json({ error: "That class is full. Please choose another date." });

    const oldClassId = booking.classId;
    const oldDate    = booking.date;

    booking.classId = newClassId;
    booking.date    = newDate;
    await booking.save();

    sendRescheduleEmail({ email: booking.studentEmail, name: booking.studentName, classId: newClassId, date: newDate, oldClassId, oldDate });

    res.json({ success: true, booking });
    spotOpened(oldClassId, oldDate);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bookings/:id/cancel-student ───────────────
router.patch("/:id/cancel-student", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ error: "email is required." });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    if (booking.studentEmail !== email.toLowerCase().trim())
      return res.status(403).json({ error: "That booking doesn't match this email address." });

    if (booking.status !== "confirmed")
      return res.status(400).json({ error: "This booking is not confirmed." });

    if (await isWithinCutoff(booking.date, booking.classId))
      return res.status(400).json({ error: "Bookings cannot be cancelled within 60 minutes of the class start time." });

    await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" });

    if (booking.passId) {
      await Pass.release(booking.passId, 1);
    }

    sendCancellationEmail({ email: booking.studentEmail, name: booking.studentName, classId: booking.classId, date: booking.date, creditCode: null });

    res.json({ success: true });
    spotOpened(booking.classId, booking.date);

    // Admin notification
    notifyAdminCancellation({ studentName: booking.studentName, studentEmail: booking.studentEmail, classId: booking.classId, date: booking.date, paymentType: booking.paymentType });

  } catch (err) {
    next(err);
  }
});

router.get("/private", async (req, res) => {
  try {
    const filter = { classId: /^private__/, status: "confirmed" };
    if (req.query.date) filter.date = req.query.date;

    const authHeader = req.headers["authorization"] || "";
    const isAdmin = authHeader.startsWith("Bearer ") &&
                    (require("../middleware/auth").peekToken(req) || {}).role === "owner";

    const fields = isAdmin
      ? "date classId _id studentName studentEmail time duration location status checkedIn"
      : "date classId _id time duration status";

    const bookings = await Booking.find(filter).sort({ date: 1 }).select(fields);
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;