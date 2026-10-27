const express   = require("express");
const router    = express.Router();
const Booking   = require("../models/Booking");
const Class     = require("../models/Class");
const Pass      = require("../models/Pass");
const Rental    = require("../models/Rental");
require("../models/Video"); // for populate("video")
const MembershipRenewal = require("../models/MembershipRenewal");
const Student   = require("../models/Student");
const Workshop  = require("../models/Workshop");
const Teacher   = require("../models/Teacher");
const adminAuth = require("../middleware/auth");
const { requireAuth } = require("../middleware/auth");
const { canAccessClass } = require("../middleware/scope");
const staffAuth = requireAuth("owner", "teacher");
const { sendWelcomeEmail } = require("../email");

// ── Helpers ───────────────────────────────────────────────
function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function defaultRange(req) {
  const today = new Date();
  const from  = req.query.from ?? toLocalDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  const to    = req.query.to   ?? toLocalDateStr(today);
  return { from, to };
}

// ── Local zip lookup — loaded from server/data/localZips.js ──
const localZips    = require("../data/localZips");
const LOCAL_ZIPS   = new Set(Object.values(localZips).flat());
const ZIP_TO_COUNTY = {};
Object.entries(localZips).forEach(([county, zips]) =>
  zips.forEach(z => ZIP_TO_COUNTY[z] = county)
);

function isLocalZip(zip) {
  return zip ? LOCAL_ZIPS.has(zip.trim().slice(0, 5)) : false;
}

const PASS_PRICES = {
  dropin: 25, pass4: 84, pass8: 152,
  member2x: 129, memberUnl: 169,
  private1: 129, private3: 387, private10: 880,
  teacher: 0,
};

// Stripe's 2.9% + $0.30 fee is baked into one-time pass prices already (the
// customer's charge is grossed up to cover it), but membership subscriptions
// charge the student the raw list price — so PASS_PRICES for memberships is
// gross, not what actually lands in the bank. Net it out for reporting.
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.30;
const netStripeAmount = (gross) => +(gross - (gross * STRIPE_PCT + STRIPE_FIXED)).toFixed(2);

const NET_PASS_PRICES = {
  member2x: netStripeAmount(PASS_PRICES.member2x),
  memberUnl: netStripeAmount(PASS_PRICES.memberUnl),
};

const PASS_LABELS = {
  dropin: "Drop-in", pass4: "4-Class Pass", pass8: "8-Class Pass",
  member2x: "2x/week Membership", memberUnl: "Monthly",
  private1: "Private — 1 Class", private3: "Private — 3 Classes", private10: "Private — 10 Classes",
  teacher: "Teacher (free)",
};

const INTERNAL_EMAILS = [
  "info@iy-sp.com",
  "info@iy-sp.org",
  "etrix01@gmail.com",
];

// ═══════════════════════════════════════════════════════════
// R1 — CHECK-IN REPORT
// GET /api/reports/checkin?from=&to=&classId=&teacher=
// ═══════════════════════════════════════════════════════════
router.get("/checkin", adminAuth, async (req, res) => {
  try {
    const { from, to } = defaultRange(req);
    const query = { date: { $gte: from, $lte: to }, status: "confirmed" };
    if (req.query.classId) query.classId = req.query.classId;

    const classes  = await Class.find({});
    const classMap = Object.fromEntries(classes.map(c => [c.id, c]));

    const bookings = await Booking.find(query);

    // Filter by teacher if requested
    const teacherFilter = req.query.teacher;

    // Group by classId + date
    const groups = {};
    for (const b of bookings) {
      const cls = classMap[b.classId];
      if (teacherFilter && cls?.teacher !== teacherFilter) continue;
      const key = `${b.classId}__${b.date}`;
      if (!groups[key]) {
        groups[key] = {
          classId:   b.classId,
          date:      b.date,
          title:     cls?.title   ?? b.classId,
          teacher:   cls?.teacher ?? "Unknown",
          booked:    0,
          checkedIn: 0,
          noShow:    0,
        };
      }
      groups[key].booked++;
      if (b.checkedIn) groups[key].checkedIn++;
    }

    // Compute no-shows and check-in rate
    const result = Object.values(groups).map(g => ({
      ...g,
      noShow:      g.booked - g.checkedIn,
      checkinRate: g.booked > 0 ? Math.round((g.checkedIn / g.booked) * 100) : 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Totals
    const totals = result.reduce((acc, g) => {
      acc.booked    += g.booked;
      acc.checkedIn += g.checkedIn;
      acc.noShow    += g.noShow;
      return acc;
    }, { booked: 0, checkedIn: 0, noShow: 0 });
    totals.checkinRate = totals.booked > 0
      ? Math.round((totals.checkedIn / totals.booked) * 100) : 0;

    res.json({ from, to, classes: result, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bookings/:id/checkin  (add this to bookings.js or here for convenience)
router.patch("/checkin/:bookingId", staffAuth, async (req, res) => {
  try {
    const { checkedIn } = req.body;
    if (req.user.role !== "owner") {
      const existing = await Booking.findById(req.params.bookingId, "classId").lean();
      if (!existing || !(await canAccessClass(req.user, existing.classId)))
        return res.status(403).json({ error: "Forbidden" });
    }
    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { checkedIn: !!checkedIn, checkedInAt: checkedIn ? new Date() : null },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    // Welcome email on first ever check-in
    if (checkedIn) {
      const previousCheckins = await Booking.countDocuments({
        studentEmail: booking.studentEmail,
        checkedIn: true,
        _id: { $ne: booking._id },
      });
      if (previousCheckins === 0) {
        const student = await Student.findOne({ email: booking.studentEmail });
        const pass = await Pass.findOne({ studentEmail: booking.studentEmail, active: true });
        await sendWelcomeEmail({
          studentEmail: booking.studentEmail,
          studentName:  student?.name || booking.studentName,
          passType:     pass?.type || booking.paymentType,
          classesTotal: pass?.classesTotal || null,
          expiresAt:    pass?.expiresAt || null,
          passCode:     pass?.code || null,
        });
        console.log(`✓ Welcome email sent to ${booking.studentEmail}`);
      }
    }
    res.json({ success: true, booking });

    } catch (err) {
    console.error("✗ Check-in error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// R2 — FIRST VISITS REPORT
// GET /api/reports/first-visits?from=&to=
// ═══════════════════════════════════════════════════════════
router.get("/first-visits", adminAuth, async (req, res) => {
  try {
    const { from, to } = defaultRange(req);

    // Students whose firstVisit falls in range
    const students = await Student.find({
      firstVisit: {
        $gte: new Date(`${from}T00:00:00`),
        $lte: new Date(`${to}T23:59:59`),
      },
    }).sort({ firstVisit: 1 });

    const result = [];
    for (const s of students) {
      // Find their first booking
      const firstBooking = await Booking.findOne({
        studentEmail: s.email,
        status: "confirmed",
      }).sort({ createdAt: 1 });

      // Check if they later converted (bought a pass/membership within 30 days)
      let converted = false;
      if (firstBooking?.paymentType === "dropin") {
        const conversionCutoff = new Date(s.firstVisit);
        conversionCutoff.setDate(conversionCutoff.getDate() + 30);
        const laterPass = await Pass.findOne({
          studentEmail: s.email,
          type: { $ne: "dropin" },
          createdAt: { $gt: s.firstVisit, $lte: conversionCutoff },
        });
        converted = !!laterPass;
      }

      const local    = isLocalZip(s.zip);
      const county   = s.zip ? ZIP_TO_COUNTY[s.zip?.trim().slice(0, 5)] ?? null : null;
      const outOfState = s.state && s.state !== "FL";

      result.push({
        name:          s.name,
        email:         s.email,
        firstVisit:    s.firstVisit,
        state:         s.state,
        zip:           s.zip,
        county,
        isLocal:       local,
        outOfState,
        paymentType:   firstBooking?.paymentType ?? "unknown",
        paymentLabel:  PASS_LABELS[firstBooking?.paymentType] ?? firstBooking?.paymentType ?? "—",
        converted,     // dropin → pass within 30 days
      });
    }

    // Summary counts
    const summary = {
      total:      result.length,
      local:      result.filter(r => r.isLocal).length,
      outOfState: result.filter(r => r.outOfState).length,
      otherFL:    result.filter(r => !r.isLocal && !r.outOfState).length,
      converted:  result.filter(r => r.converted).length,
      dropIns:    result.filter(r => r.paymentType === "dropin").length,
      passes:     result.filter(r => !["dropin","unknown"].includes(r.paymentType)).length,
    };

    res.json({ from, to, visitors: result, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// R4 — PAYROLL REPORT
// GET /api/reports/payroll?from=&to=
// ═══════════════════════════════════════════════════════════
router.get("/payroll", adminAuth, async (req, res) => {
  try {
    const { from, to } = defaultRange(req);
    const PASS_VALUE = {
      dropin: 25, pass4: 21, pass8: 19,
      member2x: 16, memberUnl: 14,
      pass: 21, // fallback for legacy "pass" type
    };

    const classBookings = await Booking.find({
      date: { $gte: from, $lte: to },
      status: "confirmed",
      classId: { $not: /^(ws_|private__)/ },
    });
    const classIds = [...new Set(classBookings.map(b => b.classId))];
    const classDefs = await Class.find({ id: { $in: classIds } });
    const classMap = Object.fromEntries(classDefs.map(c => [c.id, c]));

    // Only active teachers are eligible defaults — inactive/legacy records must never
    // contribute a rate, even if their name happens to match.
    const activeTeachers = await Teacher.find({ active: true });

    // Class.teacher stores a free-text display name (e.g. "Tricia Amheiser") which doesn't
    // always match Teacher.name exactly (e.g. "Tricia"). Match case-insensitively in either
    // direction so a short Settings name still resolves against the full class teacher name.
    function lookupTeacherRate(classTeacherName) {
      if (!classTeacherName) return 0;
      const needle = classTeacherName.trim().toLowerCase();
      const exact = activeTeachers.find(t => t.name.trim().toLowerCase() === needle);
      if (exact) return exact.payRate || 0;
      const partial = activeTeachers.find(t => {
        const n = t.name.trim().toLowerCase();
        return n && (needle.includes(n) || n.includes(needle));
      });
      return partial?.payRate || 0;
    }

    const occurrences = {};
    for (const b of classBookings) {
      const key = b.classId + "__" + b.date;
      if (!occurrences[key]) occurrences[key] = { classId: b.classId, date: b.date, attended: 0, grossRevenue: 0, breakdown: {} };
      occurrences[key].attended++;
      const val = PASS_VALUE[b.paymentType] || 0;
      occurrences[key].grossRevenue += val;
      occurrences[key].breakdown[b.paymentType] = (occurrences[key].breakdown[b.paymentType] || 0) + 1;
    }

    const byTeacher = {};
    for (const occ of Object.values(occurrences)) {
      const def = classMap[occ.classId];
      const teacher = def?.teacher || "Unknown";
      const title = def?.title || occ.classId;
      // Per-class rate wins if set; otherwise fall back to the teacher's default pay rate.
      const rate = def?.ratePerStudent || lookupTeacherRate(teacher);
      const ceiling = def?.ceiling || 0;
      const gross = occ.grossRevenue;
      let teacherPay = rate > 0 ? occ.attended * rate : 0;
      if (ceiling > 0 && teacherPay > ceiling) teacherPay = ceiling;
      if (!byTeacher[teacher]) byTeacher[teacher] = [];
      byTeacher[teacher].push({
        date: occ.date, title, attended: occ.attended,
        ratePerStudent: rate, ceiling,
        grossRevenue: gross, teacherPay, studioTake: gross - teacherPay,
        breakdown: occ.breakdown,
      });
    }
    for (const rows of Object.values(byTeacher)) rows.sort((a, b) => a.date.localeCompare(b.date));

    const wsBookings = await Booking.find({
      date: { $gte: from, $lte: to },
      status: "confirmed",
      classId: /^ws_/,
    });
    const wsGroups = {};
    for (const b of wsBookings) {
      if (!wsGroups[b.classId]) wsGroups[b.classId] = { workshopId: b.classId, title: b.workshopTitle || b.classId, bookings: [] };
      wsGroups[b.classId].bookings.push(b);
    }
    const wsIds = Object.keys(wsGroups);
    const wsDefs = await Workshop.find({ id: { $in: wsIds } });
    const wsDefMap = Object.fromEntries(wsDefs.map(w => [w.id, w]));

    const workshopRows = Object.values(wsGroups).map(occ => {
      const def = wsDefMap[occ.workshopId];
      const split = def?.teacherSplit ?? 50;
      const teacher = def?.teacher || "Unknown";
      const tiers = Object.values(def?.pricing || {}).filter(v => typeof v === "number" && v > 0);
      const price = tiers.length ? Math.min(...tiers) : 0;
      const gross = occ.bookings.length * price;
      const teacherPay = gross * (split / 100);
      return {
        date: occ.bookings.map(b => b.date).sort()[0] || from,
        title: occ.title, teacher,
        participants: occ.bookings.length, workshopPrice: price, teacherSplit: split,
        grossRevenue: gross, teacherPay, studioTake: gross - teacherPay,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const allClassRows = Object.values(byTeacher).flat();
    const cT = allClassRows.reduce((a, r) => ({ gross: a.gross + r.grossRevenue, pay: a.pay + r.teacherPay, studio: a.studio + r.studioTake, attended: a.attended + r.attended }), { gross: 0, pay: 0, studio: 0, attended: 0 });
    const wT = workshopRows.reduce((a, r) => ({ gross: a.gross + r.grossRevenue, pay: a.pay + r.teacherPay, studio: a.studio + r.studioTake, participants: a.participants + r.participants }), { gross: 0, pay: 0, studio: 0, participants: 0 });

    res.json({
      from, to,
      classes: byTeacher,
      workshops: workshopRows,
      classTotals:    { grossRevenue: cT.gross, teacherPay: cT.pay, studioTake: cT.studio, attended: cT.attended },
      workshopTotals: { grossRevenue: wT.gross, teacherPay: wT.pay, studioTake: wT.studio, participants: wT.participants },
      grandTotal:     { grossRevenue: cT.gross + wT.gross, teacherPay: cT.pay + wT.pay, studioTake: cT.studio + wT.studio },
    });
  } catch (err) {
    console.error("GET /api/reports/payroll error:", err);
    res.status(500).json({ error: err.message });
  }
});


// R5 — MONTHLY REVENUE REPORT
// GET /api/reports/monthly-revenue?month=YYYY-MM
// ═══════════════════════════════════════════════════════════
router.get("/monthly-revenue", adminAuth, async (req, res) => {
  try {
    const now   = new Date();
    const month = req.query.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [year, mon] = month.split("-").map(Number);

    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd   = new Date(year, mon, 0, 23, 59, 59); // last day of month
    const today      = new Date();

    // Drop-in bookings this month
    const dropins = await Booking.find({
      paymentType: "dropin",
      status:      "confirmed",
      createdAt:   { $gte: monthStart, $lte: monthEnd },
    });

    // Passes sold this month (non-dropin, non-membership)
    const passesSold = await Pass.find({
      type:           { $in: ["pass4", "pass8", "private1", "private3", "private10"] },
      createdAt:      { $gte: monthStart, $lte: monthEnd },
      purchaseStatus: { $in: ["complete", "admin"] },
      studentEmail:   { $nin: INTERNAL_EMAILS },
    });

    // Group pass sales by type
    const passSummary = {};
    for (const p of passesSold) {
      if (!passSummary[p.type]) passSummary[p.type] = { count: 0, total: 0, label: PASS_LABELS[p.type] };
      passSummary[p.type].count++;
      passSummary[p.type].total += PASS_PRICES[p.type] ?? 0;
    }

    const membershipRenewalsThisMonth = await MembershipRenewal.find({
      type:         { $in: ["member2x", "memberUnl"] },
      paidAt:       { $gte: monthStart, $lte: monthEnd },
      studentEmail: { $nin: INTERNAL_EMAILS },
    });

    const membershipSummary = {};
    for (const r of membershipRenewalsThisMonth) {
      if (!membershipSummary[r.type]) membershipSummary[r.type] = { count: 0, total: 0, label: PASS_LABELS[r.type] };
      membershipSummary[r.type].count++;
      membershipSummary[r.type].total += netStripeAmount(r.amountPaid);
    }

    // Projected membership revenue — active memberships that renew later this month
    // Uses expiresAt as proxy for renewal date (memberships don't expire but next renewal
    // can be tracked here — when Stripe webhook is built, nextRenewalDate will be set)
    const pendingMemberships = await Pass.find({
      type:      { $in: ["member2x", "memberUnl"] },
      active:    true,
      // renewalDate this month but after today
      expiresAt: { $gte: today, $lte: monthEnd },
    });

    const projectedSummary = {};
    for (const m of pendingMemberships) {
      if (!projectedSummary[m.type]) projectedSummary[m.type] = { count: 0, total: 0, label: PASS_LABELS[m.type] };
      projectedSummary[m.type].count++;
      projectedSummary[m.type].total += NET_PASS_PRICES[m.type] ?? PASS_PRICES[m.type] ?? 0;
    }

    const dropinTotal      = dropins.length * PASS_PRICES.dropin;
    const passTotal        = Object.values(passSummary).reduce((s, p) => s + p.total, 0);
    const memberTotal      = Object.values(membershipSummary).reduce((s, m) => s + m.total, 0);
    const projectedTotal   = Object.values(projectedSummary).reduce((s, m) => s + m.total, 0);
    const collectedTotal   = dropinTotal + passTotal + memberTotal;

    res.json({
      month,
      dropins:    { count: dropins.length, total: dropinTotal },
      passes:     passSummary,
      memberships: {
        collected: membershipSummary,
        projected: projectedSummary,
      },
      totals: {
        collected:   collectedTotal,
        projected:   projectedTotal,
        forecast:    collectedTotal + projectedTotal,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// R6 — WORKSHOP REVENUE REPORT
// GET /api/reports/workshop-revenue?from=&to=
// ═══════════════════════════════════════════════════════════
router.get("/workshop-revenue", adminAuth, async (req, res) => {
  try {
    const { from, to } = defaultRange(req);

    const bookings = await Booking.find({
      date:    { $gte: from, $lte: to },
      status:  "confirmed",
      classId: { $regex: /^ws_/ },
    });

    // Group by workshopId (classId prefix ws_)
    const workshops = {};
    for (const b of bookings) {
      // classId format: workshopId__sessionId
      const workshopId = b.classId.includes("__")
        ? b.classId.split("__")[0]
        : b.classId;

      if (!workshops[workshopId]) {
        workshops[workshopId] = {
          workshopId,
          title:    b.workshopTitle ?? workshopId,
          sessions: {},
          bookings: 0,
          revenue:  0,
        };
      }

      const w = workshops[workshopId];
      w.bookings++;

      // Group by session
      const sessionKey = b.sessionLabel ?? b.classId;
      if (!w.sessions[sessionKey]) {
        w.sessions[sessionKey] = {
          label:    b.sessionLabel ?? sessionKey,
          time:     b.sessionTime  ?? "—",
          bookings: 0,
        };
      }
      w.sessions[sessionKey].bookings++;
    }

    // Convert sessions map to array
    const result = Object.values(workshops).map(w => ({
      ...w,
      sessions: Object.values(w.sessions),
    }));

    const grandTotal = result.reduce((s, w) => s + w.revenue, 0);

    res.json({ from, to, workshops: result, grandTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// R8 — Waiver report
router.get('/waivers', adminAuth, async (req, res) => {
  try {
    const students = await Student.find(
      { waiverSigned: true },
      { name: 1, email: 1, waiverSignedAt: 1, waiverPdfPath: 1, _id: 0 }
    ).sort({ waiverSignedAt: -1 });

    res.json(students);
  } catch (err) {
    console.error('Waiver report error:', err);
    res.status(500).json({ error: 'Failed to fetch waiver report' });
  }
});


// ═══════════════════════════════════════════════════════════
// R11 — VIDEO RENTALS
// GET /api/reports/video-rentals?from=&to=   (default: last 90 days)
// Who rents, how often, paid vs free, by video and by code.
// ═══════════════════════════════════════════════════════════
router.get("/video-rentals", adminAuth, async (req, res) => {
  try {
    const today = new Date();
    const d90 = new Date(today);
    d90.setDate(d90.getDate() - 89);
    const from = req.query.from ?? toLocalDateStr(d90);
    const to   = req.query.to   ?? toLocalDateStr(today);

    const rentals = await Rental.find({
      createdAt:    { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59.999`) },
      studentEmail: { $nin: INTERNAL_EMAILS },
    }).populate("video", "title").sort({ createdAt: -1 }).lean();

    const emails = [...new Set(rentals.map(r => r.studentEmail))];
    const [students, plans] = await Promise.all([
      Student.find({ email: { $in: emails } }, { name: 1, email: 1 }).lean(),
      Pass.find({
        studentEmail: { $in: emails },
        type: { $in: ["member2x", "memberUnl", "videoSub"] },
        active: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: today } }],
      }, { studentEmail: 1, type: 1 }).lean(),
    ]);
    const nameBy = Object.fromEntries(students.map(s => [s.email, s.name]));
    const planBy = {};
    for (const p of plans) {
      const label = p.type === "videoSub" ? "Video subscription" : (PASS_LABELS[p.type] ?? p.type);
      if (!planBy[p.studentEmail]) planBy[p.studentEmail] = [];
      if (!planBy[p.studentEmail].includes(label)) planBy[p.studentEmail].push(label);
    }

    const codeOf = r => r.couponCode
      || (String(r.stripePaymentIntentId).startsWith("coupon_")
          ? String(r.stripePaymentIntentId).split("_").slice(1, -1).join("_") : null);

    const byStudent = {}, byVideo = {}, byCode = {};
    let revenueCents = 0, free = 0;
    for (const r of rentals) {
      const isFree = (r.amount ?? 0) === 0;
      const title  = r.video?.title ?? "(deleted video)";
      const code   = codeOf(r);
      revenueCents += r.amount ?? 0;
      if (isFree) free++;

      const s = byStudent[r.studentEmail] ||= {
        email: r.studentEmail, name: nameBy[r.studentEmail] ?? "",
        plan: (planBy[r.studentEmail] ?? []).join(", "),
        rentals: 0, paid: 0, free: 0, spentCents: 0, lastRentedAt: r.createdAt, titles: [],
      };
      s.rentals++; isFree ? s.free++ : s.paid++;
      s.spentCents += r.amount ?? 0;
      if (r.createdAt > s.lastRentedAt) s.lastRentedAt = r.createdAt;
      if (!s.titles.includes(title)) s.titles.push(title);

      const v = byVideo[title] ||= { title, rentals: 0, free: 0, revenueCents: 0, students: new Set() };
      v.rentals++; if (isFree) v.free++; v.revenueCents += r.amount ?? 0; v.students.add(r.studentEmail);

      if (code) {
        const c = byCode[code] ||= { code, rentals: 0, free: 0, revenueCents: 0 };
        c.rentals++; if (isFree) c.free++; c.revenueCents += r.amount ?? 0;
      }
    }

    res.json({
      from, to,
      summary: {
        rentals: rentals.length,
        students: emails.length,
        paid: rentals.length - free,
        free,
        revenueCents,
        withCode: Object.values(byCode).reduce((n, c) => n + c.rentals, 0),
      },
      students: Object.values(byStudent)
        .sort((a, b) => b.rentals - a.rentals || new Date(b.lastRentedAt) - new Date(a.lastRentedAt)),
      videos: Object.values(byVideo)
        .map(v => ({ ...v, students: v.students.size }))
        .sort((a, b) => b.rentals - a.rentals),
      codes: Object.values(byCode).sort((a, b) => b.rentals - a.rentals),
    });
  } catch (err) {
    console.error("Video rentals report error:", err);
    res.status(500).json({ error: "Failed to build video rentals report" });
  }
});

// ═══════════════════════════════════════════════════════════
// EXISTING ROUTES (preserved)
// ═══════════════════════════════════════════════════════════

// GET /api/reports/attendance
router.get("/attendance", adminAuth, async (req, res) => {
  try {
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 14);
    const from = req.query.from ?? toLocalDateStr(defaultFrom);
    const to   = req.query.to   ?? toLocalDateStr(today);

    const classes  = await Class.find({});
    const classMap = Object.fromEntries(classes.map(c => [c.id, c]));
    const bookings = await Booking.find({ date: { $gte: from, $lte: to } });

    const groups = {};
    bookings.forEach(b => {
      const key = `${b.classId}__${b.date}`;
      if (!groups[key]) {
        const cls = classMap[b.classId];
        groups[key] = {
          classId: b.classId, date: b.date,
          teacher: cls?.teacher ?? "Unknown",
          title:   cls?.title   ?? b.classId,
          confirmed: 0, cancelled: 0,
        };
      }
      if (b.status === "confirmed") groups[key].confirmed++;
      if (b.status === "cancelled") groups[key].cancelled++;
    });

    res.json({ from, to, classes: Object.values(groups) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/revenue
router.get("/revenue", adminAuth, async (req, res) => {
  try {
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(today.getDate() - 13);
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : defaultFrom;
    const to   = req.query.to   ? new Date(`${req.query.to}T23:59:59`)   : today;

    const dropins = await Booking.find({
      paymentType: "dropin", status: "confirmed",
      createdAt: { $gte: from, $lte: to },
    });
    const passes = await Pass.find({
      type:           { $ne: "dropin" },
      createdAt:      { $gte: from, $lte: to },
      purchaseStatus: { $in: ["complete", "admin"] },
      studentEmail:   { $nin: INTERNAL_EMAILS },
    });

    const passSummary = {};
    for (const p of passes) {
      if (!passSummary[p.type]) passSummary[p.type] = { count: 0, total: 0 };
      passSummary[p.type].count++;
      passSummary[p.type].total += NET_PASS_PRICES[p.type] ?? PASS_PRICES[p.type] ?? 0;
    }

    const dropinTotal = dropins.length * PASS_PRICES.dropin;
    const passTotal   = Object.values(passSummary).reduce((s, p) => s + p.total, 0);

    res.json({
      from: from instanceof Date ? toLocalDateStr(from) : from,
      to:   to   instanceof Date ? toLocalDateStr(to)   : to,
      dropins:    { count: dropins.length, total: dropinTotal },
      passes:     passSummary,
      grandTotal: dropinTotal + passTotal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/pass-alerts
router.get("/pass-alerts", adminAuth, async (req, res) => {
  try {
    const now      = new Date();
    const in14Days = new Date(now);
    in14Days.setDate(now.getDate() + 14);

    const passes = await Pass.find({
      active: true,
      type:   { $nin: ["dropin"] },
      $or: [
        { expiresAt: { $lte: in14Days, $gte: now } },
        { classesRemaining: { $lte: 2 } },
      ],
    }).sort({ expiresAt: 1, classesRemaining: 1 });

    const alerts = passes.map(p => {
      const daysLeft = p.expiresAt
        ? Math.ceil((new Date(p.expiresAt) - now) / (1000 * 60 * 60 * 24))
        : null;
      const reasons = [];
      if (daysLeft !== null && daysLeft <= 14) reasons.push("Expiring soon");
      if (p.classesRemaining <= 2) reasons.push("Low balance");
      return {
        passId: p._id, studentEmail: p.studentEmail,
        passType: p.type, passLabel: PASS_LABELS[p.type] ?? p.type,
        classesRemaining: p.classesRemaining, expiresAt: p.expiresAt,
        daysLeft, reasons,
      };
    });

    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/pass-alerts/remind-all
router.post("/pass-alerts/remind-all", adminAuth, async (req, res) => {
  try {
    const { sendPassReminderEmail } = require("../email");
    const { alerts } = req.body;
    const seen    = new Set();
    const results = [];

    for (const alert of alerts) {
      if (seen.has(alert.studentEmail)) continue;
      seen.add(alert.studentEmail);
      const student     = await Student.findOne({ email: alert.studentEmail });
      const studentName = student?.name ?? alert.studentEmail;
      await sendPassReminderEmail({
        studentEmail: alert.studentEmail, studentName,
        passType: alert.passType, classesRemaining: alert.classesRemaining,
        expiresAt: alert.expiresAt,
      });
      results.push({ email: alert.studentEmail, sent: true });
    }

    res.json({ sent: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// QR CHECK-IN — added for native app scan screen (July 2026)
// ═══════════════════════════════════════════════════════════

// GET /api/reports/checkin/:bookingId — resolve a single booking. Used by the
// native app's scan screen after it decodes "florium-checkin:<bookingId>" from
// the QR embedded in the Brevo confirmation email.
router.get("/checkin/:bookingId", staffAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!(await canAccessClass(req.user, booking.classId))) return res.status(403).json({ error: "Forbidden" });

    const cls = await Class.findOne({ id: booking.classId });

    res.json({
      booking: {
        _id:          booking._id,
        studentName:  booking.studentName,
        studentEmail: booking.studentEmail,
        status:       booking.status,
        checkedIn:    booking.checkedIn,
        paymentType:  booking.paymentType,
        classId:      booking.classId,
        date:         booking.date,
        classTitle:   cls?.title ?? booking.classId,
        classTime:    cls?.time ?? null,
      },
    });
  } catch (err) {
    res.status(404).json({ error: "Booking not found." });
  }
});

// GET /api/reports/checkin/:bookingId/qr — public PNG for the <img src> in the
// confirmation email. Deliberately has NO adminAuth: mail clients fetch this
// with no Authorization header. Safe because it's keyed on a Mongo ObjectId,
// same trust level as the existing reschedule/cancel links.
router.get("/checkin/:bookingId/qr", async (req, res) => {
  try {
    const QRCode = require("qrcode");
    const payload = `florium-checkin:${req.params.bookingId}`;
    const png = await QRCode.toBuffer(payload, { width: 280, margin: 1 });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  } catch (err) {
    res.status(500).end();
  }
});

module.exports = router;
