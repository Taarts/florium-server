require("dotenv").config();
const mongoose = require("mongoose");
const Class    = require("./models/Class");
const Workshop = require("./models/Workshop");
const Student  = require("./models/Student");
const Pass     = require("./models/Pass");
const Booking  = require("./models/Booking");
const Teacher  = require("./models/Teacher");

// ─────────────────────────────────────────────────────────────
// PROTECTED TEST ACCOUNT — never wiped, never touched.
// Note: the OLD seed script had a fake "Juniper Smyth" demo
// student at juniper.smyth@gmail.com — different person, same
// name as the real protected account by coincidence. That fake
// record has been dropped from this script entirely to avoid
// future confusion between the two.
// ─────────────────────────────────────────────────────────────
const PROTECTED_EMAIL = "etrix01@gmail.com";

// ─────────────────────────────────────────────────────────────
// Fixed date range: July 1 – October 31, 2026.
// Fixed (not relative to "today") so re-running this script
// always produces the same spread and testers can bookmark
// specific date ranges in Reports.
// ─────────────────────────────────────────────────────────────
const RANGE_START = "2026-07-01";
const RANGE_END   = "2026-10-31";
const TODAY       = new Date(); // real clock — drives checkedIn / past-vs-future logic

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function toLocalDateStr(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function dateObj(str) { return new Date(str + "T00:00:00"); }
function isPast(dateStr) { return dateObj(dateStr) < TODAY; }
function addDays(str, n) {
  const d = dateObj(str);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}
function passCode(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function rand(min, max) { return Math.random() * (max - min) + min; }
function chance(p) { return Math.random() < p; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// All occurrence dates of a weekday between two fixed dates (inclusive)
function weeklyOccurrences(dayOfWeek, startStr, endStr) {
  const start = dateObj(startStr);
  const end   = dateObj(endStr);
  const out   = [];
  let d = new Date(start);
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1);
  while (d <= end) {
    out.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Teachers
// ─────────────────────────────────────────────────────────────
const TEACHER_DEFS = [
  { name: "Maya Patel", email: "maya.patel@florium.demo", payRate: 5,   bio: "500-hour certified vinyasa and hatha teacher, 8 years experience.",  active: true },
  { name: "Jordan Lee", email: "jordan.lee@florium.demo", payRate: 4,   bio: "Pilates instructor specializing in mat and reformer fundamentals.", active: true },
  { name: "Sam Rivera", email: "sam.rivera@florium.demo", payRate: 4.5, bio: "Meditation and restorative yoga teacher, online class specialist.", active: true },
];

// ─────────────────────────────────────────────────────────────
// Classes — subject + ratePerStudent + ceiling added so R4
// Payroll has real numbers to calculate against.
// ─────────────────────────────────────────────────────────────
const CLASS_DEFS = [
  { id: "cls_mon",        title: "Morning Flow Yoga",          subject: "Vinyasa",    teacher: "Maya Patel", dayOfWeek: 1, time: "09:00", duration: 75, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 5,   ceiling: 60 },
  { id: "cls_tue_pm",     title: "Pilates Fundamentals",       subject: "Pilates",    teacher: "Jordan Lee", dayOfWeek: 2, time: "18:00", duration: 60, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 4,   ceiling: 50 },
  { id: "cls_wed",        title: "Hatha Yoga",                 subject: "Hatha",      teacher: "Maya Patel", dayOfWeek: 3, time: "10:00", duration: 90, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 5,   ceiling: 60 },
  { id: "cls_wed_eve",    title: "Yin & Meditation",           subject: "Yin",        teacher: "Sam Rivera", dayOfWeek: 3, time: "19:00", duration: 75, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 4.5, ceiling: 55 },
  { id: "cls_thu",        title: "Power Pilates",              subject: "Pilates",    teacher: "Jordan Lee", dayOfWeek: 4, time: "07:00", duration: 60, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 4,   ceiling: 50 },
  { id: "cls_fri",        title: "Vinyasa Flow",               subject: "Vinyasa",    teacher: "Maya Patel", dayOfWeek: 5, time: "10:00", duration: 90, venue: "venue_001",    price: 25, isPrivate: false, ratePerStudent: 5,   ceiling: 60 },
  { id: "cls_sat_online", title: "Weekend Yoga — Online",      subject: "Vinyasa",    teacher: "Sam Rivera", dayOfWeek: 6, time: "08:30", duration: 90, venue: "venue_online", price: 25, isPrivate: false, ratePerStudent: 4.5, ceiling: 55 },
  { id: "cls_sun_online", title: "Sunday Meditation — Online", subject: "Meditation", teacher: "Sam Rivera", dayOfWeek: 0, time: "09:00", duration: 60, venue: "venue_online", price: 25, isPrivate: false, ratePerStudent: 4.5, ceiling: 55 },
];

// ─────────────────────────────────────────────────────────────
// Regulars — existing customers. firstVisit is set BEFORE the
// Jul–Oct demo range so they never show up as "new" in R2.
// Each carries a pass "profile" that drives their Pass record
// and their weekly booking pattern.
// ─────────────────────────────────────────────────────────────
const LOCAL_ZIP = "33701"; // St Pete / Pinellas — always "local" for R2

const REGULARS = [
  { name: "Ravi Mehta",      email: "ravi.mehta@gmail.com",      profile: "pass4",     classId: "cls_mon",        firstVisit: "2026-03-04" },
  { name: "Diane Holloway",  email: "diane.holloway@gmail.com",  profile: "member2x",  classId: "cls_tue_pm",     firstVisit: "2026-02-18" },
  { name: "Marcus Webb",     email: "marcus.webb@yahoo.com",     profile: "pass8",     classId: "cls_wed",        firstVisit: "2026-01-22" },
  { name: "Laura Chen",      email: "laura.chen@icloud.com",     profile: "memberUnl", classId: "cls_mon",        firstVisit: "2026-04-01" },
  { name: "Priya Nair",      email: "priya.nair@gmail.com",      profile: "pass4",     classId: "cls_thu",        firstVisit: "2026-05-06" },
  { name: "James Okoye",     email: "james.okoye@outlook.com",   profile: "pass8",     classId: "cls_sun_online", firstVisit: "2026-03-29" },
  { name: "Sarah Mitchell",  email: "sarah.mitchell@gmail.com",  profile: "member2x",  classId: "cls_wed_eve",    firstVisit: "2026-02-10" },
  { name: "Lillian Childs",  email: "lillian.childs@gmail.com",  profile: "pass8",     classId: "cls_wed",        firstVisit: "2026-01-15" },
  { name: "Josephine Baker", email: "josephine.baker@gmail.com", profile: "pass4",     classId: "cls_fri",        firstVisit: "2026-04-19" },
  { name: "Cleo Baptiste",   email: "cleo.baptiste@gmail.com",   profile: "memberUnl", classId: "cls_sat_online", firstVisit: "2026-03-12" },
  { name: "Omar Sharif",     email: "omar.sharif@outlook.com",   profile: "pass8",     classId: "cls_fri",        firstVisit: "2026-02-25" },
  { name: "Patrick Nguyen",  email: "patrick.nguyen@gmail.com",  profile: "member2x",  classId: "cls_mon",        firstVisit: "2026-01-08" },
  { name: "Dana Cross",      email: "dana.cross@icloud.com",     profile: "memberUnl", classId: "cls_wed",        firstVisit: "2026-05-20" },
  { name: "Lisa Kudrow",     email: "lkudrow@email.com",         profile: "pass4",     classId: "cls_fri",        firstVisit: "2026-04-07" },
].map(r => ({ ...r, city: "St. Petersburg", state: "FL", zip: LOCAL_ZIP, isLocal: true, county: "Pinellas" }));

// ─────────────────────────────────────────────────────────────
// Newcomers — 3 per month, July–October. Drives R2 First Visits.
// Mix of local FL and out-of-state; ~50% convert to a pass
// within the 30-day window (matches how R2 defines "converted").
// ─────────────────────────────────────────────────────────────
const OUT_OF_STATE = [
  { state: "NY", zip: "10001", city: "New York" },
  { state: "GA", zip: "30301", city: "Atlanta" },
  { state: "NC", zip: "27601", city: "Raleigh" },
  { state: "IL", zip: "60601", city: "Chicago" },
];

const NEWCOMER_NAMES = [
  "Bianca Ortiz", "Trevor Wu", "Amara Osei", "Felix Grant", "Nina Popov", "Caleb Rhodes",
  "Yuki Tanaka", "Rosa Delgado", "Micah Stone", "Ellie Fairweather", "Owen Blackwood", "Simone Achebe",
];

const NEWCOMERS = [];
["2026-07", "2026-08", "2026-09", "2026-10"].forEach((month, mi) => {
  for (let i = 0; i < 3; i++) {
    const idx  = mi * 3 + i;
    const name = NEWCOMER_NAMES[idx];
    const day  = 5 + i * 9; // spread across the month: ~5th, 14th, 23rd
    const firstVisit = `${month}-${String(day).padStart(2, "0")}`;
    const local = i !== 2; // 2 of 3 local, 1 of 3 out-of-state, each month
    const loc = local
      ? { state: "FL", zip: LOCAL_ZIP, city: "St. Petersburg", isLocal: true, county: "Pinellas" }
      : { ...pick(OUT_OF_STATE), isLocal: false, county: null };
    NEWCOMERS.push({
      name,
      email: name.toLowerCase().replace(/\s+/g, ".") + "@gmail.com",
      firstVisit,
      classId: pick(CLASS_DEFS).id,
      willConvert: chance(0.5),
      ...loc,
    });
  }
});

// ─────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✓ Connected");

  // ── Wipe, protecting the real test account ──────────────────
  await Class.deleteMany({});
  await Workshop.deleteMany({});
  await Teacher.deleteMany({});
  await Student.deleteMany({ email: { $ne: PROTECTED_EMAIL } });
  await Pass.deleteMany({ studentEmail: { $ne: PROTECTED_EMAIL } });
  await Booking.deleteMany({ studentEmail: { $ne: PROTECTED_EMAIL } });
  console.log(`✓ Cleared all collections (protected ${PROTECTED_EMAIL})`);

  // ── Teachers ──────────────────────────────────────────────
  const teachers = await Teacher.insertMany(TEACHER_DEFS);
  const teacherIdByName = Object.fromEntries(teachers.map(t => [t.name, t._id]));
  console.log(`✓ Seeded ${teachers.length} teachers`);

  // ── Classes ───────────────────────────────────────────────
  const classDocs = CLASS_DEFS.map(c => ({
    ...c,
    teacherId: teacherIdByName[c.teacher] ?? null,
    startDate: "2026-01-01",
  }));
  await Class.insertMany(classDocs);
  console.log(`✓ Seeded ${classDocs.length} classes`);
  const classMap = Object.fromEntries(CLASS_DEFS.map(c => [c.id, c]));

  // ── Students ──────────────────────────────────────────────
  const studentDocs = [
    ...REGULARS.map(r => ({
      name: r.name, email: r.email, city: r.city, state: r.state, zip: r.zip,
      isLocal: r.isLocal, county: r.county, firstVisit: dateObj(r.firstVisit),
      waiverSigned: chance(0.85),
      waiverSignedAt: chance(0.85) ? dateObj(r.firstVisit) : null,
    })),
    ...NEWCOMERS.map(n => ({
      name: n.name, email: n.email, city: n.city, state: n.state, zip: n.zip,
      isLocal: n.isLocal, county: n.county, firstVisit: dateObj(n.firstVisit),
      waiverSigned: chance(0.6),
      waiverSignedAt: chance(0.6) ? dateObj(n.firstVisit) : null,
    })),
  ];
  await Student.insertMany(studentDocs);
  console.log(`✓ Seeded ${studentDocs.length} students`);

  // ── Bookings + Passes ────────────────────────────────────
  const bookings = [];
  const passes   = [];

  // -- Regulars: weekly attendance against their home class --
  for (const r of REGULARS) {
    const cls = classMap[r.classId];
    const occurrences = weeklyOccurrences(cls.dayOfWeek, RANGE_START, RANGE_END);

    if (r.profile === "member2x" || r.profile === "memberUnl") {
      // Simplified cadence for demo purposes: memberUnl attends most weeks,
      // member2x roughly every other week on this class (a real member2x
      // would likely also attend a 2nd class — kept to one here for clarity).
      const freq = r.profile === "memberUnl" ? 0.85 : 0.5;
      for (const date of occurrences) {
        if (!chance(freq)) continue;
        const past = isPast(date);
        bookings.push({
          studentEmail: r.email, studentName: r.name, classId: r.classId, date,
          paymentType: r.profile,
          status: past && chance(0.04) ? "cancelled" : "confirmed",
          checkedIn: past ? chance(0.9) : false,
        });
      }
      // Monthly membership renewal records: collected for Jul + Aug (past).
      // The Aug record's expiresAt is deliberately staggered into Sep or
      // Oct so BOTH months have real numbers in R5's "projected" section —
      // this is a simplification, not real billing-cycle logic (no Stripe
      // webhook driving renewals yet per the launch TODO).
      passes.push({ code: passCode("FLO"), type: r.profile, studentEmail: r.email, classesTotal: null, classesUsed: 0, active: true, expiresAt: dateObj("2026-07-31"), createdAtOverride: "2026-07-01" });
      const secondExpiry = chance(0.5) ? "2026-09-15" : "2026-10-05";
      passes.push({ code: passCode("FLO"), type: r.profile, studentEmail: r.email, classesTotal: null, classesUsed: 0, active: true, expiresAt: dateObj(secondExpiry), createdAtOverride: "2026-08-01" });

    } else {
      // pass4 / pass8 holders — fixed attendance count, spread evenly
      // across the range, deliberately leaving a low balance on most
      // of them so Pass Alerts has entries to show.
      const total  = r.profile === "pass4" ? 4 : 8;
      const target = total - (r.profile === "pass4" ? 1 : 2);
      const step   = Math.max(Math.floor(occurrences.length / target), 1);
      let used = 0;
      for (let i = 0; i < occurrences.length && used < target; i += step) {
        const date = occurrences[i];
        bookings.push({
          studentEmail: r.email, studentName: r.name, classId: r.classId, date,
          paymentType: r.profile, status: "confirmed",
          checkedIn: isPast(date),
        });
        used++;
      }
      const expiresSoon = chance(0.3); // some deliberately expiring soon → Pass Alerts
      passes.push({
        code: passCode("FLO"), type: r.profile, studentEmail: r.email,
        classesTotal: total, classesUsed: used, active: true,
        expiresAt: expiresSoon ? addDays(toLocalDateStr(TODAY), 10) : "2026-11-30",
        createdAtOverride: r.firstVisit,
      });
    }
  }

  // -- Newcomers: single dropin booking on firstVisit, ~50% convert --
  for (const n of NEWCOMERS) {
    bookings.push({
      studentEmail: n.email, studentName: n.name, classId: n.classId, date: n.firstVisit,
      paymentType: "dropin", status: "confirmed", checkedIn: isPast(n.firstVisit),
    });
    if (n.willConvert) {
      const purchaseDate = addDays(n.firstVisit, 10 + Math.floor(rand(0, 15))); // within 30-day window
      passes.push({
        code: passCode("FLO"), type: "pass4", studentEmail: n.email,
        classesTotal: 4, classesUsed: 0, active: true,
        expiresAt: addDays(purchaseDate, 60), createdAtOverride: purchaseDate,
      });
    }
  }

  // -- Workshop: one Saturday retreat in September, two sessions --
  // Note: R6 workshop revenue is hardcoded to 0 server-side right now
  // (nothing populates it yet) — bookings will show, revenue won't,
  // regardless of what this script seeds. Flagging so it's not a surprise.
  const WORKSHOP_ID   = "fallretreat";
  const WORKSHOP_DATE = "2026-09-19";
  await Workshop.create({
    id: WORKSHOP_ID,
    title: "Fall Restorative Retreat",
    teacher: "Maya Patel",
    description: "A half-day restorative and meditation retreat.",
    days: [{
      date: WORKSHOP_DATE,
      venue: "venue_001",
      sessions: [
        { id: "sess1", label: "Morning Session — Restorative Flow",  time: "09:00", duration: 120, price: 45 },
        { id: "sess2", label: "Afternoon Session — Yin & Sound Bath", time: "13:00", duration: 120, price: 45 },
      ],
    }],
    pricing: { perSession: 45, fullDay: 80, fullWorkshop: 80 },
  });
  const workshopAttendees = [...REGULARS.slice(0, 5), ...NEWCOMERS.slice(6, 9)];
  workshopAttendees.forEach((s, i) => {
    const session = i % 2 === 0
      ? { id: "sess1", label: "Morning Session — Restorative Flow",  time: "09:00" }
      : { id: "sess2", label: "Afternoon Session — Yin & Sound Bath", time: "13:00" };
    bookings.push({
      studentEmail: s.email, studentName: s.name,
      classId: `ws_${WORKSHOP_ID}__${session.id}`, date: WORKSHOP_DATE,
      paymentType: "dropin", status: "confirmed", checkedIn: isPast(WORKSHOP_DATE),
      workshopTitle: "Fall Restorative Retreat", sessionLabel: session.label, sessionTime: session.time,
    });
  });
  console.log(`✓ Seeded 1 workshop with ${workshopAttendees.length} session bookings`);

  // -- A few private lessons (excluded from R4 payroll grouping) --
  const privateDates = ["2026-07-10", "2026-08-14", "2026-09-22"];
  privateDates.forEach((date, i) => {
    const s = REGULARS[i];
    bookings.push({
      studentEmail: s.email, studentName: s.name,
      classId: `private__lesson${i + 1}`, date,
      paymentType: "private1", status: "confirmed", checkedIn: isPast(date),
    });
  });

  await Booking.insertMany(bookings);
  console.log(`✓ Seeded ${bookings.length} bookings`);

  // Passes — apply createdAt override. Mongoose's timestamps option
  // only sets createdAt if it isn't already present on the document,
  // so an explicit value here is respected, not overwritten.
  const passDocs = passes.map(p => {
    const { createdAtOverride, ...rest } = p;
    return {
      ...rest,
      expiresAt: rest.expiresAt instanceof Date ? rest.expiresAt : dateObj(rest.expiresAt),
      createdAt: dateObj(createdAtOverride),
    };
  });
  await Pass.insertMany(passDocs);
  console.log(`✓ Seeded ${passDocs.length} passes`);

  await mongoose.disconnect();
  console.log("✓ Done.");
}

seed().catch(err => { console.error(err); process.exit(1); });
