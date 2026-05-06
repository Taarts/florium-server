const express   = require("express");
const router    = express.Router();
const Booking   = require("../models/Booking");
const Class     = require("../models/Class");
const Pass      = require("../models/Pass");
const Student   = require("../models/Student");
const adminAuth = require("../middleware/auth");

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
};

const PASS_LABELS = {
  dropin: "Drop-in", pass4: "4-Class Pass", pass8: "8-Class Pass",
  member2x: "2x/week Membership", memberUnl: "Unlimited Membership",
  private1: "Private — 1 Class", private3: "Private — 3 Classes", private10: "Private — 10 Classes",
};

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
router.patch("/checkin/:bookingId", adminAuth, async (req, res) => {
  try {
    const { checkedIn } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { checkedIn: !!checkedIn, checkedInAt: checkedIn ? new Date() : null },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    res.json({ booking });
  } catch (err) {
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

    const classes  = await Class.find({});
    const classMap = Object.fromEntries(classes.map(c => [c.id, c]));

    // Get all confirmed bookings with check-in data
    const bookings = await Booking.find({
      date:   { $gte: from, $lte: to },
      status: "confirmed",
    });

    // Get workshop bookings separately
    const workshopBookings = await Booking.find({
      date:      { $gte: from, $lte: to },
      status:    "confirmed",
      classId:   { $regex: /^ws_/ },
    });

    // Group regular class bookings by classId + date
    const groups = {};
    for (const b of bookings) {
      if (b.classId.startsWith("ws_") || b.classId.startsWith("private__")) continue;
      const cls = classMap[b.classId];
      const key = `${b.classId}__${b.date}`;
      if (!groups[key]) {
        groups[key] = {
          classId:   b.classId,
          date:      b.date,
          title:     cls?.title   ?? b.classId,
          teacher:   cls?.teacher ?? "Unknown",
          attended:  0,  // checkedIn = true
          booked:    0,  // all confirmed
        };
      }
      groups[key].booked++;
      if (b.checkedIn) groups[key].attended++;
    }

    // Group by teacher and apply pay rates
    // Pay structure from data.js staff array — flat per-student for now
    // Future: tiered own-class rates + sub rate + workshop %
    const byTeacher = {};

    for (const g of Object.values(groups)) {
      const t = g.teacher;
      if (!byTeacher[t]) byTeacher[t] = { teacher: t, classes: [], workshopPay: 0, totalPay: 0 };
      byTeacher[t].classes.push(g);
    }

    // Workshop pay — placeholder for future % of revenue calc
    // For now, workshops are listed separately with 0 pay until % rate is configured
    const workshopGroups = {};
    for (const b of workshopBookings) {
      const key = b.classId;
      if (!workshopGroups[key]) {
        workshopGroups[key] = {
          workshopId:    b.classId,
          workshopTitle: b.workshopTitle ?? b.classId,
          bookings:      0,
        };
      }
      workshopGroups[key].bookings++;
    }

    res.json({
      from,
      to,
      teachers:   Object.values(byTeacher),
      workshops:  Object.values(workshopGroups),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
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
      type:      { $in: ["pass4", "pass8", "private1", "private3", "private10"] },
      createdAt: { $gte: monthStart, $lte: monthEnd },
    });

    // Group pass sales by type
    const passSummary = {};
    for (const p of passesSold) {
      if (!passSummary[p.type]) passSummary[p.type] = { count: 0, total: 0, label: PASS_LABELS[p.type] };
      passSummary[p.type].count++;
      passSummary[p.type].total += PASS_PRICES[p.type] ?? 0;
    }

    // Memberships collected this month (active memberships created or renewed this month)
    const membershipsCollected = await Pass.find({
      type:      { $in: ["member2x", "memberUnl"] },
      createdAt: { $gte: monthStart, $lte: monthEnd },
    });

    const membershipSummary = {};
    for (const m of membershipsCollected) {
      if (!membershipSummary[m.type]) membershipSummary[m.type] = { count: 0, total: 0, label: PASS_LABELS[m.type] };
      membershipSummary[m.type].count++;
      membershipSummary[m.type].total += PASS_PRICES[m.type] ?? 0;
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
      projectedSummary[m.type].total += PASS_PRICES[m.type] ?? 0;
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
      type: { $ne: "dropin" },
      createdAt: { $gte: from, $lte: to },
    });

    const passSummary = {};
    for (const p of passes) {
      if (!passSummary[p.type]) passSummary[p.type] = { count: 0, total: 0 };
      passSummary[p.type].count++;
      passSummary[p.type].total += PASS_PRICES[p.type] ?? 0;
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

module.exports = router;
