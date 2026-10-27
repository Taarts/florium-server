// Class waitlists (decided with Tricia 10-15):
//   join     → only when the class is full (booked + held spots ≥ cap) and the waitlist is on
//   spot opens (cancel / reschedule away / an offer declined or expired)
//            → the FIRST person waiting is offered the spot: it's HELD for them for the studio's
//              waitlistHoldHours (default 12, never past class start) and they get an email with
//              Confirm / Cancel. More than one open spot → more than one offer.
//   confirm  → pass or membership holders are booked straight from their pass;
//              everyone else is sent to the booking page to pay for their held spot
//   cancel   → removed from the list, confirmation email, next person offered
//   no reply → offer expires: removed from the list, email, next person offered
//   books the class any other way → removed from the list
const crypto   = require("crypto");
const Booking  = require("../models/Booking");
const Class    = require("../models/Class");
const Pass     = require("../models/Pass");
const Settings = require("../models/Settings");
const Waitlist = require("../models/Waitlist");
const { classStart } = require("./classTime");
const { BOOKING_APP_URL } = require("../config/studio");

const fail = (status, error, extra = {}) => ({ ok: false, status, error, ...extra });
const appBase = () => String(BOOKING_APP_URL || "").replace(/\/+$/, "");
const lower = (e) => String(e || "").toLowerCase().trim();
const mail = () => require("../email"); // lazy: email.js is large and requires config

async function reorderWaitlist(classId, date) {
  const remaining = await Waitlist.find({ classId, date }).sort({ position: 1 });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].position !== i + 1) {
      remaining[i].position = i + 1;
      await remaining[i].save();
    }
  }
}

function bookingLink(cls, date, extra = {}) {
  const q = new URLSearchParams({ openClass: cls.id, date, ...extra });
  // Trailing slash: nginx redirects /<studio> → /<studio>/ and drops the query string
  return `${appBase()}/${encodeURIComponent(cls.studio)}/?${q.toString()}`;
}
const offerLink = (cls, token, action) =>
  `${appBase()}/${encodeURIComponent(cls.studio)}/waitlist?${new URLSearchParams({ token, action })}`;

// Spots taken = confirmed bookings + spots currently held for someone on the waitlist.
// excludeEmail: a person's own held spot doesn't count against them.
async function takenCount(classId, date, excludeEmail = null) {
  const [booked, held] = await Promise.all([
    Booking.countDocuments({ classId, date, status: "confirmed" }),
    Waitlist.countDocuments({
      classId, date, status: "offered", holdUntil: { $gt: new Date() },
      ...(excludeEmail ? { studentEmail: { $ne: lower(excludeEmail) } } : {}),
    }),
  ]);
  return booked + held;
}

async function removeEntry(entry) {
  await Waitlist.deleteOne({ _id: entry._id });
  await reorderWaitlist(entry.classId, entry.date);
}

async function joinWaitlist({ cls, date, email, name }) {
  if (!cls.cap || !cls.waitlistEnabled) return fail(400, "This class doesn't have a waitlist.");
  const start = classStart(date, cls.time);
  if (!start || start <= new Date()) return fail(400, "This class has already started.");
  await expireOffers({ classId: cls.id, date });

  if ((await takenCount(cls.id, date)) < cls.cap)
    return fail(409, "A spot is available — you can book it now.", { spotAvailable: true });
  if (await Booking.exists({ classId: cls.id, date, studentEmail: email, status: "confirmed" }))
    return fail(409, "You're already booked into this class.");

  const existing = await Waitlist.findOne({ classId: cls.id, date, studentEmail: email });
  if (existing) return { ok: true, position: existing.position, already: true };

  const last = await Waitlist.findOne({ classId: cls.id, date }).sort({ position: -1 });
  let entry;
  try {
    entry = await Waitlist.create({ classId: cls.id, date, studentEmail: email, studentName: name, position: (last?.position || 0) + 1 });
  } catch (err) {
    if (err.code === 11000) {
      const dup = await Waitlist.findOne({ classId: cls.id, date, studentEmail: email });
      return { ok: true, position: dup?.position, already: true };
    }
    throw err;
  }
  const { waitlistHoldHours } = await Settings.getSingleton(cls.studio);
  mail().sendWaitlistConfirmationEmail({ studentEmail: email, studentName: name, cls, date, position: entry.position, holdHours: waitlistHoldHours })
    .catch((err) => console.error("✗ waitlist confirmation email:", err.message));
  return { ok: true, position: entry.position };
}

async function leaveWaitlist(classId, date, email) {
  const entry = await Waitlist.findOne({ classId, date, studentEmail: lower(email) });
  if (entry) await removeEntry(entry);
  return !!entry;
}

// Offer open spots to the people waiting, in order. Safe to call any time.
async function promoteWaitlist(classId, date) {
  const cls = await Class.findOne({ id: classId });
  if (!cls || !cls.cap || !cls.waitlistEnabled) return [];
  const start = classStart(date, cls.time);
  if (!start || start <= new Date()) return [];

  const { waitlistHoldHours = 12 } = await Settings.getSingleton(cls.studio);
  const offered = [];
  while ((await takenCount(classId, date)) < cls.cap) {
    const holdUntil = new Date(Math.min(Date.now() + waitlistHoldHours * 3600 * 1000, start.getTime()));
    const token = crypto.randomBytes(24).toString("hex");
    // Atomically claim the next person still waiting
    const next = await Waitlist.findOneAndUpdate(
      { classId, date, status: "waiting" },
      { $set: { status: "offered", offeredAt: new Date(), holdUntil, token } },
      { sort: { position: 1 }, new: true }
    );
    if (!next) break;
    if (await Booking.exists({ classId, date, studentEmail: next.studentEmail, status: "confirmed" })) {
      await removeEntry(next); // already booked in another way
      continue;
    }
    await mail().sendWaitlistOfferEmail({
      studentEmail: next.studentEmail, studentName: next.studentName, cls, date, holdUntil,
      confirmUrl: offerLink(cls, token, "confirm"), cancelUrl: offerLink(cls, token, "cancel"),
    }).catch((err) => console.error("✗ waitlist offer email:", err.message));
    console.log(`✓ waitlist: ${classId} ${date} → spot held for ${next.studentEmail} until ${holdUntil.toISOString()}`);
    offered.push(next);
  }
  return offered;
}

// Offers nobody answered in time: off the list, email, next person offered.
async function expireOffers(filter = {}) {
  const stale = await Waitlist.find({ ...filter, status: "offered", holdUntil: { $lte: new Date() } });
  const touched = new Set();
  for (const entry of stale) {
    await removeEntry(entry);
    touched.add(`${entry.classId}|${entry.date}`);
    const cls = await Class.findOne({ id: entry.classId });
    mail().sendWaitlistExpiredEmail({ studentEmail: entry.studentEmail, studentName: entry.studentName, cls, date: entry.date })
      .catch((err) => console.error("✗ waitlist expired email:", err.message));
    console.log(`· waitlist: hold expired for ${entry.studentEmail} (${entry.classId} ${entry.date})`);
  }
  for (const key of touched) {
    const [classId, date] = key.split("|");
    await promoteWaitlist(classId, date);
  }
  return stale.length;
}

async function findOffer(token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  const entry = await Waitlist.findOne({ token, status: "offered" });
  if (!entry) return null;
  if (!entry.holdUntil || entry.holdUntil <= new Date()) {
    await expireOffers({ _id: entry._id });
    return null;
  }
  const cls = await Class.findOne({ id: entry.classId });
  return cls ? { entry, cls } : null;
}

// The best pass this student can use for this class, or null.
async function usablePass(email, date) {
  const passes = await Pass.find({ studentEmail: email, active: true });
  const ok = passes.filter((p) => p.isValid().valid && ["member2x", "memberUnl", "pass4", "pass8", "dropin"].includes(p.type));
  const rank = { memberUnl: 0, member2x: 1, pass4: 2, pass8: 2, dropin: 3 };
  ok.sort((a, b) => (rank[a.type] - rank[b.type]) || ((a.expiresAt || Infinity) - (b.expiresAt || Infinity)));
  for (const p of ok) {
    if (p.type === "memberUnl" &&
        await Booking.exists({ studentEmail: email, date, status: { $ne: "cancelled" } })) continue; // one class a day
    return p;
  }
  return null;
}

async function respondToOffer(token, action) {
  const found = await findOffer(token);
  if (!found) return fail(410, "This offer has expired or was already used.");
  const { entry, cls } = found;
  const email = entry.studentEmail;

  if (action === "cancel") {
    await removeEntry(entry);
    mail().sendWaitlistDeclinedEmail({ studentEmail: email, studentName: entry.studentName, cls, date: entry.date })
      .catch((err) => console.error("✗ waitlist declined email:", err.message));
    promoteWaitlist(entry.classId, entry.date).catch((err) => console.error("✗ waitlist promote:", err.message));
    return { ok: true, cancelled: true };
  }
  if (action !== "confirm") return fail(400, "Unknown action.");

  if (await Booking.exists({ classId: cls.id, date: entry.date, studentEmail: email, status: "confirmed" })) {
    await removeEntry(entry);
    return { ok: true, booked: true, already: true };
  }

  const pass = await usablePass(email, entry.date);
  if (!pass) {
    // No pass: their spot stays held while they pay on the booking page.
    return { ok: true, needsPayment: true, holdUntil: entry.holdUntil,
             bookUrl: bookingLink(cls, entry.date, { email, name: entry.studentName || "" }) };
  }

  let booking;
  try {
    booking = await Booking.create({ studentEmail: email, studentName: entry.studentName || email,
      classId: cls.id, date: entry.date, paymentType: pass.type, passId: pass._id });
  } catch (err) {
    if (err.code === 11000) { await removeEntry(entry); return { ok: true, booked: true, already: true }; }
    throw err;
  }
  const consumed = await Pass.consume(pass._id, 1);
  if (!consumed) {
    await Booking.deleteOne({ _id: booking._id });
    return { ok: true, needsPayment: true, holdUntil: entry.holdUntil,
             bookUrl: bookingLink(cls, entry.date, { email, name: entry.studentName || "" }) };
  }
  await removeEntry(entry);
  mail().sendBookingConfirmation({ name: entry.studentName || email, email, classId: cls.id, date: entry.date,
    paymentType: pass.type, classesRemaining: consumed.classesRemaining ?? null, bookingId: booking._id, cls: cls.toObject() });
  console.log(`✓ waitlist: ${email} confirmed ${cls.id} ${entry.date} with ${pass.type}`);
  return { ok: true, booked: true, paymentType: pass.type, classesRemaining: consumed.classesRemaining ?? null };
}

module.exports = {
  joinWaitlist, leaveWaitlist, promoteWaitlist, expireOffers, findOffer, respondToOffer,
  takenCount, reorderWaitlist, bookingLink,
};
