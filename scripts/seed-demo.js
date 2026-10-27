#!/usr/bin/env node
// scripts/seed-demo.js — fills the Florium public demo with realistic sample data.
//
// SAFETY: refuses to run unless DEMO_MODE=1 AND the database name contains "demo".
// It wipes and rebuilds ONLY that database, plus this deployment's uploads/images and
// uploads/files-local folders. Dates are relative to today, so the demo always looks current.
// Safe to re-run (the nightly reset runs it).
//
//   cd /var/www/florium-server && node scripts/seed-demo.js
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs       = require("fs");
const path     = require("path");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// ── Guards ────────────────────────────────────────────────────
if (process.env.DEMO_MODE !== "1") {
  console.error("✗ refusing: DEMO_MODE is not 1 — this script only seeds the public demo");
  process.exit(1);
}
const URI = process.env.MONGODB_URI || "";
let DB_NAME = "";
try { DB_NAME = new URL(URI).pathname.replace(/^\//, ""); } catch { /* handled below */ }
if (!/demo/i.test(DB_NAME)) {
  console.error(`✗ refusing: database "${DB_NAME || "(default)"}" doesn't contain "demo"`);
  process.exit(1);
}

const ROOT      = path.join(__dirname, "..");
const IMG_DIR   = path.join(ROOT, "uploads", "images");
const FILES_DIR = path.join(ROOT, "uploads", "files-local");
const API_BASE  = process.env.PUBLIC_API_URL || "https://demo.florium.live/api";
const STUDIO    = process.env.STUDIO_ID || "demo";
const PASSWORD  = "florium2026";

const m = name => require(path.join(ROOT, "models", name));
const Block = m("Block"), Booking = m("Booking"), Cancellation = m("Cancellation"), Class = m("Class"),
      Coupon = m("Coupon"), MembershipAgreement = m("MembershipAgreement"),
      MembershipRenewal = m("MembershipRenewal"), Newsletter = m("Newsletter"), Override = m("Override"),
      Pass = m("Pass"), Product = m("Product"), Rental = m("Rental"), Sale = m("Sale"),
      Settings = m("Settings"), Signature = m("Signature"), Student = m("Student"), Teacher = m("Teacher"),
      User = m("User"), Venue = m("Venue"), Video = m("Video"), Waitlist = m("Waitlist"),
      Workshop = m("Workshop");
const ALL_MODELS = [Block, Booking, Cancellation, Class, Coupon, MembershipAgreement, MembershipRenewal,
  Newsletter, Override, Pass, Product, Rental, Sale, Settings, Signature, Student, Teacher, User, Venue,
  Video, Waitlist, Workshop];

// ── Helpers ───────────────────────────────────────────────────
let _seed = 20261006;
const rand  = () => { _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0; let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick  = arr => arr[Math.floor(rand() * arr.length)];
const int   = (a, b) => a + Math.floor(rand() * (b - a + 1));
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const TZ = "America/New_York";
const ymd = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const NOW = new Date();
const TODAY = ymd(NOW);
const dayMs = 86400000;
const addDays = (ymdStr, n) => { const d = new Date(ymdStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ymdStr => new Date(ymdStr + "T12:00:00Z").getUTCDay();
const at = (ymdStr, hhmm = "12:00") => new Date(`${ymdStr}T${hhmm}:00-04:00`);
const nextDow = (from, d) => { let x = from; while (dow(x) !== d) x = addDays(x, 1); return x; };
const code = prefix => prefix + Math.random().toString(36).slice(2, 6).toUpperCase();
const img = file => `/uploads/images/${file}`;
const absImg = file => `${API_BASE}/uploads/images/${file}`;

// Insert with explicit createdAt/updatedAt (bypasses Mongoose's automatic timestamps).
async function insertDated(Model, docs) {
  if (!docs.length) return [];
  const raw = docs.map(({ createdAt, ...d }) => {
    const o = new Model(d).toObject();
    o.createdAt = createdAt || NOW; o.updatedAt = createdAt || NOW;
    return o;
  });
  await Model.collection.insertMany(raw);
  return raw;
}

// ── Illustrations (generated SVGs — no stock photos, no licensing) ──
const PALETTE = ["#1e5c3a", "#2f7a52", "#c9a84c", "#6a6454", "#3d6b5a", "#a8743a"];
function avatarSvg(initials, bg, accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="${bg}"/>
  <circle cx="320" cy="80" r="120" fill="${accent}" opacity="0.35"/>
  <circle cx="60" cy="360" r="140" fill="#ffffff" opacity="0.08"/>
  <circle cx="200" cy="165" r="70" fill="#f3efe6"/>
  <path d="M70 400c10-90 70-140 130-140s120 50 130 140z" fill="#f3efe6"/>
  <text x="200" y="185" font-family="Georgia, serif" font-size="56" fill="${bg}" text-anchor="middle">${initials}</text>
</svg>`;
}
function bannerSvg(title, subtitle, bg, accent) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#10221a"/></linearGradient></defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <circle cx="980" cy="160" r="230" fill="${accent}" opacity="0.28"/>
  <circle cx="1080" cy="520" r="140" fill="#ffffff" opacity="0.07"/>
  <path d="M0 560 C 250 470, 450 640, 700 560 S 1050 470, 1200 540 L1200 675 L0 675 Z" fill="${accent}" opacity="0.22"/>
  <text x="80" y="330" font-family="Georgia, serif" font-size="78" fill="#f3efe6">${esc(title)}</text>
  <text x="82" y="400" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#f3efe6" opacity="0.8">${esc(subtitle)}</text>
</svg>`;
}
function writeImage(file, svg) { fs.writeFileSync(path.join(IMG_DIR, file), svg); return file; }

// ── Main ──────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(URI);
  const actual = mongoose.connection.db.databaseName;
  if (!/demo/i.test(actual)) { console.error(`✗ refusing: connected database is "${actual}"`); process.exit(1); }
  console.log(`· seeding database "${actual}" for ${TODAY}`);

  await Promise.all(ALL_MODELS.map(M => M.init()));
  for (const M of ALL_MODELS) await M.deleteMany({});

  for (const dir of [IMG_DIR, FILES_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Venues ──
  const venues = [
    { id: "venue_001", name: "Main Studio", address: "100 Garden Way, Springfield", capacity: 18 },
    { id: "venue_002", name: "Garden Room", address: "100 Garden Way, Springfield", capacity: 10 },
    { id: "venue_online", name: "Online", address: null, capacity: null },
  ];
  await Venue.insertMany(venues);
  const venueName = id => venues.find(v => v.id === id)?.name || id;

  // ── Teachers ──
  const teacherDefs = [
    { name: "Maya Chen",    email: "teacher@example.com", payRate: 9, initials: "MC",
      bio: "Maya has taught flow-based yoga for twelve years and loves helping new students find steadiness in movement. Her classes are playful, well-paced and always end with a long rest." },
    { name: "Jordan Ellis", email: "jordan@example.com", payRate: 8, initials: "JE",
      bio: "A former dancer, Jordan teaches Pilates mat with a focus on core strength, posture and moving well every day. Expect clear cues and a good sweat." },
    { name: "Sam Rivera",   email: "sam@example.com",    payRate: 8, initials: "SR",
      bio: "Sam teaches the quieter side of practice: Yin, Restorative and guided meditation. Their classes are slow, spacious and deeply restful." },
    { name: "Priya Nair",   email: "priya@example.com",  payRate: 10, initials: "PN",
      bio: "Priya leads alignment-focused classes, workshops and the studio's teacher development course. She is known for precise instruction and creative use of props." },
  ];
  const teachers = [];
  for (const [i, t] of teacherDefs.entries()) {
    const file = writeImage(`teacher-${t.initials.toLowerCase()}.svg`, avatarSvg(t.initials, PALETTE[i % PALETTE.length], PALETTE[(i + 2) % PALETTE.length]));
    teachers.push(await Teacher.create({ name: t.name, email: t.email, payRate: t.payRate, bio: t.bio, image: img(file), active: true }));
  }
  const T = name => teachers.find(t => t.name.startsWith(name)).name;

  // ── Logins (public: shown on the demo banner) ──
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create({ email: "owner@example.com", name: "Alex Morgan", passwordHash, role: "owner", studios: [STUDIO], active: true });
  await User.create({ email: "teacher@example.com", name: "Maya Chen", passwordHash, role: "teacher", studios: [STUDIO],
                      teacherId: teachers[0]._id, active: true });

  // ── Classes (weekly) ──
  const START = addDays(TODAY, -56);
  const classArt = {};
  const art = (key, title, sub, i) => (classArt[key] ||= writeImage(`class-${key}.svg`, bannerSvg(title, sub, PALETTE[i % PALETTE.length], "#c9a84c")));
  const classDefs = [
    { id: "cls_vinyasa_mon",  title: "Vinyasa Flow",        dayOfWeek: 1, time: "09:00", duration: 60, teacher: T("Maya"),   subject: "Vinyasa",     venue: "venue_001", price: 22, art: ["vinyasa", "Vinyasa Flow", "Breath-led movement", 0],
      description: "A steady, creative flow linking breath and movement. Suitable for students comfortable with sun salutations." },
    { id: "cls_restore_mon",  title: "Restorative",         dayOfWeek: 1, time: "18:00", duration: 75, teacher: T("Sam"),    subject: "Restorative", venue: "venue_002", price: 20, priceMin: 10, priceMax: 30, art: ["restorative", "Restorative", "Pay what you can", 3],
      description: "Fully supported poses with bolsters and blankets. Pay what you can: choose a price between $10 and $30." },
    { id: "cls_pilates_tue",  title: "Pilates Mat",         dayOfWeek: 2, time: "07:00", duration: 55, teacher: T("Jordan"), subject: "Pilates",     venue: "venue_001", price: 22, cap: 8, waitlistEnabled: true, art: ["pilates", "Pilates Mat", "Core, posture, strength", 1],
      description: "Classical mat Pilates for a strong, supple centre. Small class: capped at 8, with a waitlist." },
    { id: "cls_hatha_wed",    title: "Hatha Foundations",   dayOfWeek: 3, time: "10:00", duration: 60, teacher: T("Maya"),   subject: "Hatha",       venue: "venue_001", price: 20, art: ["hatha", "Hatha Foundations", "Build your practice", 4],
      description: "Learn the essential standing poses, twists and breathing practices at a comfortable pace. Great for beginners." },
    { id: "cls_yin_wed",      title: "Yin",                 dayOfWeek: 3, time: "19:00", duration: 75, teacher: T("Sam"),    subject: "Yin",         venue: "venue_002", price: 22, art: ["yin", "Yin", "Long, quiet holds", 2],
      description: "Long-held floor poses that work into the connective tissue, with time to slow down and notice." },
    { id: "cls_align_thu",    title: "Alignment Lab",       dayOfWeek: 4, time: "18:00", duration: 90, teacher: T("Priya"),  subject: "Alignment",   venue: "venue_001", price: 25, isHybrid: true, art: ["align", "Alignment Lab", "In studio and online", 5],
      description: "Precise, prop-supported work on one family of poses each week. Join in the studio or live online." },
    { id: "cls_pilates_thu",  title: "Pilates Mat",         dayOfWeek: 4, time: "07:00", duration: 55, teacher: T("Jordan"), subject: "Pilates",     venue: "venue_001", price: 22, cap: 8, waitlistEnabled: true, art: ["pilates", "Pilates Mat", "Core, posture, strength", 1],
      description: "Classical mat Pilates for a strong, supple centre. Small class: capped at 8, with a waitlist." },
    { id: "cls_lunch_fri",    title: "Lunchtime Flow",      dayOfWeek: 5, time: "12:00", duration: 45, teacher: T("Maya"),   subject: "Vinyasa",     venue: "venue_online", price: 15, art: ["lunch", "Lunchtime Flow", "45 minutes, online", 0],
      description: "A brisk 45-minute online flow to reset the middle of your day." },
    { id: "cls_vinyasa_sat",  title: "Weekend Vinyasa",     dayOfWeek: 6, time: "09:30", duration: 75, teacher: T("Maya"),   subject: "Vinyasa",     venue: "venue_001", price: 22, cap: 16, art: ["weekend", "Weekend Vinyasa", "Saturday energy", 1],
      description: "A longer, stronger Saturday flow with time for inversions and a long savasana." },
    { id: "cls_meditate_sun", title: "Guided Meditation",   dayOfWeek: 0, time: "09:00", duration: 30, teacher: T("Sam"),    subject: "Meditation",  venue: "venue_online", price: 12, art: ["meditation", "Guided Meditation", "30 minutes, online", 3],
      description: "A calm, guided 30-minute sit to start your Sunday. No experience needed." },
  ];
  const classes = [];
  for (const c of classDefs) {
    const [key, title, sub, i] = c.art;
    const { art: _a, ...doc } = c;
    classes.push(await Class.create({ ...doc, image: img(art(key, title, sub, i)), startDate: START, endDate: null,
      ratePerStudent: 0, ceiling: 0, isPrivate: false, studio: STUDIO }));
  }

  // ── Workshops / series / course ──
  const sat1 = nextDow(addDays(TODAY, 10), 6);
  const sun1 = nextDow(addDays(TODAY, 1), 0);
  const workshops = [
    { id: "ws_backbends", title: "Backbends & Heart Openers", teacher: T("Priya"), kind: "workshop", teacherSplit: 60, allowSingle: true,
      description: "A half-day exploration of safe, joyful backbending: preparation, technique and counterposes. Come to one session or both.",
      days: [{ date: sat1, venue: "venue_001", sessions: [
        { id: "am", label: "Morning: preparation", time: "10:00", duration: 120, price: 45 },
        { id: "pm", label: "Afternoon: full backbends", time: "14:00", duration: 120, price: 45 } ] }],
      pricing: { perSession: 45, fullDay: 80, fullWorkshop: 80 }, art: ["Backbends", "A half-day workshop with Priya"] },
    { id: "ws_beginners", title: "Beginners' Series", teacher: T("Maya"), kind: "series", teacherSplit: 50, allowSingle: true,
      description: "Four Sunday sessions covering the foundations: standing poses, breath, forward bends and relaxation. Book the series or drop in.",
      days: [0, 7, 14, 21].map((n, i) => ({ date: addDays(sun1, n), venue: "venue_002",
        sessions: [{ id: `s${i + 1}`, label: `Week ${i + 1}`, time: "11:00", duration: 60, price: 20 }] })),
      pricing: { perSession: 20, fullDay: 0, fullWorkshop: 70 }, art: ["Beginners' Series", "Four Sundays with Maya"] },
    { id: "ws_teacherdev", title: "Teacher Development Course", teacher: T("Priya"), kind: "course", teacherSplit: 70, allowSingle: false,
      description: "A 12-hour course for teachers and committed students: sequencing, hands-on assists and teaching skills. Sold as a full course.",
      days: [3, 10, 24, 38].map((n, i) => ({ date: nextDow(addDays(TODAY, n), 6), venue: "venue_001",
        sessions: [{ id: `m${i + 1}`, label: `Module ${i + 1}`, time: "13:00", duration: 180, price: 0 }] })),
      pricing: { perSession: 0, fullDay: 0, fullWorkshop: 450 }, art: ["Teacher Development", "A 12-hour course with Priya"] },
  ];
  for (const [i, w] of workshops.entries()) {
    const { art: [title, sub], ...doc } = w;
    await Workshop.create({ ...doc, image: img(writeImage(`ws-${w.id}.svg`, bannerSvg(title, sub, PALETTE[(i + 1) % PALETTE.length], "#c9a84c"))) });
  }

  // ── Students ──
  const first = ["Avery", "Blake", "Casey", "Dana", "Elliot", "Frankie", "Gemma", "Harper", "Isla", "Jamie", "Kai", "Lena",
    "Morgan", "Noor", "Oscar", "Parker", "Quinn", "Riley", "Sasha", "Theo", "Uma", "Vera", "Wren", "Ximena", "Yusuf", "Zara",
    "Ada", "Ben", "Clara", "Dev", "Esme", "Finn", "Grace", "Hugo", "Ivy", "Jonah", "Kira", "Leo", "Mila", "Nate"];
  const last = ["Abbott", "Bennett", "Carter", "Diaz", "Evans", "Foster", "Garcia", "Hughes", "Ito", "Jensen", "Kim", "Lopez",
    "Mensah", "Novak", "Okafor", "Patel", "Quinn", "Reyes", "Silva", "Tanaka"];
  const students = [];
  for (let i = 0; i < 40; i++) {
    const name = `${first[i]} ${pick(last)}`;
    const email = `${first[i].toLowerCase()}.${name.split(" ")[1].toLowerCase()}${i}@example.com`;
    const firstVisit = at(addDays(TODAY, -int(5, 84)), "09:00");
    students.push({ name, email, phone: `555-01${String(i).padStart(2, "0")}`, address: `${int(10, 990)} Elm Street`,
      city: "Springfield", state: "FL", zip: "32000", isLocal: rand() > 0.15, county: "Springfield County", firstVisit,
      waiverSigned: rand() > 0.1, waiverSignedAt: firstVisit, emailUnsubscribed: false, createdAt: firstVisit });
  }
  await insertDated(Student, students);

  // ── Passes + memberships ──
  const passPrice = { pass4: 84, pass8: 152, member2x: 120, memberUnl: 160, private3: 240, videoSub: 99 };
  const passDocs = [], plan = [];
  const assign = (type, count) => { for (let k = 0; k < count; k++) plan.push(type); };
  assign("pass4", 9); assign("pass8", 7); assign("member2x", 4); assign("memberUnl", 3); assign("private3", 2); assign("videoSub", 1);
  const passHolders = shuffle(students).slice(0, plan.length);
  plan.forEach((type, i) => {
    const s = passHolders[i];
    const bought = addDays(TODAY, -int(3, 50));
    const isMember = type === "member2x" || type === "memberUnl" || type === "videoSub";
    const total = { pass4: 4, pass8: 8, member2x: 9, memberUnl: null, private3: 3, videoSub: null }[type];
    const expiryDays = { pass4: 60, pass8: 90 }[type];
    passDocs.push({
      _id: new mongoose.Types.ObjectId(),
      code: code(type.startsWith("private") ? "PRIV-" : "YOGA-"), type, studentEmail: s.email,
      classesTotal: total, classesUsed: 0,
      expiresAt: expiryDays ? at(addDays(bought, expiryDays)) : null, active: true,
      currentPeriodEnd: isMember ? at(addDays(bought, 30)) : undefined,
      stripeSubscriptionId: isMember ? `sub_demo_${i}` : undefined,
      stripePaymentId: isMember ? undefined : `pi_demo_pass_${i}`,
      amountPaid: passPrice[type], purchaseStatus: "complete", notes: "Demo data",
      createdAt: at(bought, "10:00"),
    });
  });
  const passByEmail = {};
  for (const p of passDocs) if (["pass4", "pass8", "member2x", "memberUnl"].includes(p.type)) passByEmail[p.studentEmail] = p;

  // ── Bookings: 8 weeks back, 2 weeks ahead ──
  const bookings = [];
  const taken = new Set();
  const regulars = shuffle(students).slice(0, 28);
  const book = (email, name, classId, date, extra = {}) => {
    const key = `${email}|${classId}|${date}`;
    if (taken.has(key)) return false;
    taken.add(key);
    bookings.push({ studentEmail: email, studentName: name, classId, date, status: "confirmed", checkedIn: false, ...extra });
    return true;
  };
  for (let d = START; d <= addDays(TODAY, 14); d = addDays(d, 1)) {
    const past = d < TODAY;
    for (const c of classes.filter(c => c.dayOfWeek === dow(d))) {
      const cap = c.cap || 14;
      const n = Math.min(cap, past ? int(3, Math.min(cap, 11)) : int(1, Math.min(cap, 6)));
      for (const s of shuffle(regulars).slice(0, n)) {
        let pass = passByEmail[s.email];
        if (pass && pass.classesTotal !== null && pass.classesUsed >= pass.classesTotal) pass = null;
        if (pass && pass.createdAt > at(d, c.time)) pass = null;
        const paymentType = pass ? pass.type : "dropin";
        const ok = book(s.email, s.name, c.id, d, {
          paymentType, passId: pass ? pass._id : null,
          stripePaymentId: pass ? null : `pi_demo_${bookings.length}`,
          time: c.time, duration: c.duration, location: venueName(c.venue),
          status: past && rand() < 0.04 ? "no-show" : "confirmed",
          checkedIn: past && rand() < 0.92, checkedInAt: past ? at(d, c.time) : null,
          createdAt: at(addDays(d, -int(0, 6)), "08:00"),
        });
        if (ok && pass && past) pass.classesUsed += 1;
      }
    }
  }
  // Fill the next Pilates class to its cap, and put two people on the waitlist.
  const nextPilates = nextDow(addDays(TODAY, 1), 2);
  const pil = classes.find(c => c.id === "cls_pilates_tue");
  for (const s of shuffle(students).slice(0, 12)) {
    if (bookings.filter(b => b.classId === pil.id && b.date === nextPilates).length >= pil.cap) break;
    book(s.email, s.name, pil.id, nextPilates, { paymentType: "dropin", stripePaymentId: `pi_demo_${bookings.length}`,
      time: pil.time, duration: pil.duration, location: "Main Studio", createdAt: NOW });
  }
  const waiting = students.filter(s => !taken.has(`${s.email}|${pil.id}|${nextPilates}`)).slice(0, 2);
  await Waitlist.insertMany(waiting.map((s, i) => ({ classId: pil.id, date: nextPilates, studentEmail: s.email, studentName: s.name, position: i + 1 })));

  // Workshop bookings
  const wsBook = (w, dayIdx, sess, s) => book(s.email, s.name, `${w.id}__${dayIdx}__${sess.id}`, w.days[dayIdx].date, {
    paymentType: "dropin", stripePaymentId: `pi_demo_ws_${bookings.length}`, workshopTitle: w.title,
    sessionLabel: sess.label, sessionTime: sess.time, time: sess.time, duration: sess.duration,
    location: venueName(w.days[dayIdx].venue), createdAt: at(addDays(TODAY, -int(1, 10)), "11:00") });
  const [wsA, wsB, wsC] = workshops;
  for (const s of shuffle(students).slice(0, 9)) wsBook(wsA, 0, wsA.days[0].sessions[rand() < 0.6 ? 0 : 1], s);
  for (const s of shuffle(students).slice(0, 6)) wsA.days[0].sessions.forEach(sess => wsBook(wsA, 0, sess, s));
  for (const s of shuffle(students).slice(0, 7)) wsB.days.forEach((d, i) => wsBook(wsB, i, d.sessions[0], s));
  for (const s of shuffle(students).slice(0, 5)) wsC.days.forEach((d, i) => wsBook(wsC, i, d.sessions[0], s));

  await insertDated(Pass, passDocs);
  await insertDated(Booking, bookings);

  // Membership agreements + renewals (feed the revenue reports)
  const members = passDocs.filter(p => p.type === "member2x" || p.type === "memberUnl");
  await MembershipAgreement.insertMany(members.map(p => {
    const s = students.find(x => x.email === p.studentEmail);
    return { studentName: s.name, studentEmail: s.email, membershipType: p.type, monthlyPrice: passPrice[p.type], signedAt: p.createdAt };
  }));
  const renewals = [];
  for (const p of members) {
    for (let k = 0, paid = p.createdAt; paid <= NOW; k++, paid = new Date(paid.getTime() + 30 * dayMs)) {
      renewals.push({ passId: p._id, passCode: p.code, type: p.type, studentEmail: p.studentEmail,
        stripeSubscriptionId: p.stripeSubscriptionId, stripeInvoiceId: `in_demo_${p.code}_${k}`,
        amountPaid: passPrice[p.type], periodEnd: new Date(paid.getTime() + 30 * dayMs), paidAt: paid, isInitial: k === 0 });
    }
  }
  await MembershipRenewal.insertMany(renewals);

  // ── Calendar extras ──
  await Cancellation.create({ classId: "cls_yin_wed", date: nextDow(addDays(TODAY, 1), 3) });
  await Override.create({ classId: "cls_vinyasa_mon", date: nextDow(addDays(TODAY, 8), 1), venue: "venue_002" });
  await Block.create({ date: nextDow(addDays(TODAY, 2), 5), time: "14:00", duration: 120, note: "Studio photoshoot" });

  // ── Settings / announcement ──
  const settings = await Settings.getSingleton();
  settings.adminEmails = ["owner@example.com"];
  settings.notificationsEnabled = false;
  settings.notificationMode = "off";
  settings.announcementText = "Welcome to the Florium demo studio. Book a class with test card 4242 4242 4242 4242, or sign in as the owner to explore the admin.";
  settings.announcementActive = true;
  await settings.save();

  // ── Signature ──
  const ownerImg = writeImage("owner-am.svg", avatarSvg("AM", "#1e5c3a", "#c9a84c"));
  await Signature.create({ label: "Owner", signOff: "Warmly,", name: "Alex Morgan", title: "Studio Owner", photo: absImg(ownerImg),
    phone: "555-0100", email: "hello@florium.live", website: "florium.live", isDefault: true });

  // ── Coupons ──
  const someone = students[3];
  await Coupon.insertMany([
    { code: "WELCOME10", type: "percent", amount: 10, appliesToTypes: ["pass4", "pass8"], maxUses: 0 },
    { code: "MEMBERVIDEO", type: "percent", amount: 50, appliesToTypes: ["video_rental"], allowedMemberships: ["member2x"] },
    { code: "FRIEND", type: "percent", amount: 100, appliesToTypes: ["video_rental"], allowedEmails: [someone.email], maxUses: 3 },
  ]);

  // ── Merch ──
  const products = await Product.insertMany([
    { name: "Cork Yoga Block",      category: "Props",    sku: "FLO-BLK-01", price: 18, cost: 7,  stock: 24 },
    { name: "Cotton Strap",         category: "Props",    sku: "FLO-STR-01", price: 12, cost: 4,  stock: 30 },
    { name: "Studio Mat",           category: "Props",    sku: "FLO-MAT-01", price: 68, cost: 32, stock: 10 },
    { name: "Florium Tote",         category: "Apparel",  sku: "FLO-TOT-01", price: 22, cost: 8,  stock: 15 },
    { name: "Herbal Tea Sampler",   category: "Wellness", sku: "FLO-TEA-01", price: 14, cost: 5,  stock: 20, taxable: false },
  ]);
  const sales = [];
  for (let i = 0; i < 22; i++) {
    const p = pick(products); const q = rand() < 0.8 ? 1 : 2;
    sales.push({ productId: p._id, productName: p.name, quantity: q, unitPrice: p.price, total: p.price * q,
      paymentMethod: rand() < 0.7 ? "card" : "cash", date: addDays(TODAY, -int(0, 55)) });
  }
  await Sale.insertMany(sales);

  // ── Videos (placeholder player in the demo) ──
  const vids = [
    { title: "Vinyasa Flow", teacher: T("Maya"), subject: "Vinyasa", cls: "cls_vinyasa_mon", back: 7, art: ["Vinyasa Flow", "Class recording"] },
    { title: "Alignment Lab: Twists", teacher: T("Priya"), subject: "Alignment", cls: "cls_align_thu", back: 12, art: ["Alignment Lab", "Twists"] },
    { title: "Yin for Hips", teacher: T("Sam"), subject: "Yin", cls: "cls_yin_wed", back: 20, art: ["Yin for Hips", "Class recording"] },
    { title: "Pilates Mat: Core", teacher: T("Jordan"), subject: "Pilates", cls: "cls_pilates_tue", back: 27, art: ["Pilates Mat", "Core focus"] },
  ];
  const videoDocs = [];
  for (const [i, v] of vids.entries()) {
    const cls = classes.find(c => c.id === v.cls);
    const date = (() => { let d = addDays(TODAY, -v.back); while (dow(d) !== cls.dayOfWeek) d = addDays(d, -1); return d; })();
    const file = writeImage(`video-${i + 1}.svg`, bannerSvg(v.art[0], v.art[1], PALETTE[i % PALETTE.length], "#c9a84c"));
    videoDocs.push(await Video.create({ title: `${date} - ${v.title}`, teacher: v.teacher, subject: v.subject,
      durationSeconds: cls.duration * 60, bunnyVideoId: `demo-video-${i + 1}`, thumbnailUrl: absImg(file),
      source: "zoom_recording", isPublished: true, classId: cls.id, classDate: date, uploadedAt: at(date, "20:00") }));
  }
  await Rental.create({ video: videoDocs[0]._id, studentEmail: students[5].email, stripePaymentIntentId: "pi_demo_rental_1",
    amount: 1500, expiresAt: new Date(NOW.getTime() + 36 * 3600 * 1000) });
  // Fixed "Watch" login for showing the demo: tricia.demo2@example.com can watch Yin for Hips and Pilates Mat
  for (const [i, re] of [/yin/i, /pilates/i].entries()) {
    const v = videoDocs.find(d => re.test(d.title));
    if (v) await Rental.create({ video: v._id, studentEmail: "tricia.demo2@example.com",
      stripePaymentIntentId: `pi_demo_rental_tricia_${i + 1}`, amount: 1500,
      expiresAt: new Date(NOW.getTime() + 36 * 3600 * 1000) });
  }

  // ── Newsletters ──
  const hero = absImg(writeImage("newsletter-hero.svg", bannerSvg("This month at the studio", "Florium Demo Studio", "#1e5c3a", "#c9a84c")));
  const blocks = (h, body) => [
    { id: "b1", type: "heading", text: h, level: 1, align: "left" },
    { id: "b2", type: "image", src: hero, alt: "Florium Demo Studio", href: "", caption: "" },
    { id: "b3", type: "text", html: body },
    { id: "b4", type: "button", label: "See the schedule", url: "https://demo.florium.live/demo", align: "center" },
    { id: "b5", type: "divider" },
  ];
  await Newsletter.create({ subject: "Welcome to our new schedule", previewText: "New classes, a beginners' series and more",
    audience: "all", greeting: true, signatureId: "default", status: "sent", sentAt: at(addDays(TODAY, -14), "09:00"),
    stats: { delivered: 38, opens: 24, clicks: 9, unsubscribes: 0, bounces: 1 }, statsAt: NOW,
    blocks: blocks("Our new schedule is here", "<p>We've added Lunchtime Flow on Fridays and a second Pilates Mat class on Thursdays. Small classes fill fast, so book ahead.</p>") });
  await Newsletter.create({ subject: "Backbends workshop + Beginners' Series", previewText: "Two ways to deepen your practice this month",
    audience: "all", greeting: true, signatureId: "default", status: "draft",
    blocks: blocks("Two ways to go deeper", `<p>Join Priya for <strong>Backbends &amp; Heart Openers</strong> on ${sat1}, or start from the beginning with Maya's four-week <strong>Beginners' Series</strong>.</p>`) });

  // ── Summary ──
  const counts = {};
  for (const M of ALL_MODELS) counts[M.modelName] = await M.countDocuments();
  console.log("✓ demo seeded:", JSON.stringify(counts));
  console.log(`✓ images: ${fs.readdirSync(IMG_DIR).length} files in uploads/images`);
  await mongoose.disconnect();
})().catch(async err => {
  console.error("✗ seed failed:", err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
