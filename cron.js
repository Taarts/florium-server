if (process.env.DEMO_MODE === "1") { console.log("· cron disabled (DEMO_MODE)"); return; }
const cron    = require("node-cron");
const Booking = require("./models/Booking");
const Class   = require("./models/Class");
const Settings = require("./models/Settings");
const Teacher  = require("./models/Teacher");
const Cancellation = require("./models/Cancellation");
const { sendAdminDigest } = require("./email");

// Tracks which class+date combos have already had a digest sent this cycle.
// Stored in memory — sufficient for a single-process server.
// Key format: "classId|date"
const digestSentLog = new Set();

// Who gets a class's roster digest: the owner's own classes go to Settings.adminEmails;
// every other teacher's classes go to OTHER_TEACHERS_DIGEST_TO.
// The class's teacher also gets their own roster (email on their Teacher record).
const lowerList = v => String(v).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
const OWNER_TEACHERS = lowerList(process.env.DIGEST_OWNER_TEACHERS || "Tricia");
const OTHER_TEACHERS_DIGEST_TO = lowerList(process.env.OTHER_TEACHERS_DIGEST_TO || "info@flourishyoga.studio");
const esc = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function digestRecipients(cls, settings) {
  const t = String(cls.teacher || "").trim().toLowerCase();
  const isOwner = OWNER_TEACHERS.some(o => t === o || t.startsWith(o + " "));
  const base = isOwner || !OTHER_TEACHERS_DIGEST_TO.length ? settings.adminEmails : OTHER_TEACHERS_DIGEST_TO;
  const list = [...base];
  if (t) {
    const teacher = await Teacher.findOne(
      { name: new RegExp(`^\\s*${esc(cls.teacher.trim())}\\s*$`, "i"), active: { $ne: false } }, "email"
    ).lean();
    const te = String(teacher?.email || "").trim().toLowerCase();
    if (te && !list.map(x => String(x).toLowerCase()).includes(te)) list.push(te);
  }
  return list;
}

function nowInET() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

// Runs every minute — checks for classes starting in 30–31 mins
cron.schedule("* * * * *", async () => {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.notificationsEnabled || !settings.adminEmails?.length || settings.notificationMode === "off") return;

    const now     = nowInET();
    const soon    = new Date(now.getTime() + 30 * 60 * 1000);
    const soonEnd = new Date(now.getTime() + 31 * 60 * 1000);

    // Build today's date string
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    // Fetch all classes and find ones starting in the 30–31 min window
    const classes = await Class.find({ $or: [{ endDate: null }, { endDate: { $gt: new Date() } }] });

    for (const cls of classes) {
      // Parse class start time into a Date for today
      const [hours, minutes] = cls.time.split(":").map(Number);
      const classStart = new Date(`${today}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);

      if (classStart < soon || classStart >= soonEnd) continue;

      const key = `${cls.id}|${today}`;
      if (digestSentLog.has(key)) continue; // already sent this cycle

      // Fetch confirmed bookings for this class today
      const bookings = await Booking.find({
        classId: cls.id,
        date:    today,
        status:  "confirmed",
      });

      if (!bookings.length) {
        digestSentLog.add(key); // mark sent even if empty — no point re-checking
        continue;
      }

      const students = bookings.map(b => ({
        studentName:  b.studentName,
        studentEmail: b.studentEmail,
        paymentType:  b.paymentType,
      }));

     for (const email of await digestRecipients(cls, settings)) {
        await sendAdminDigest({
          adminEmail: email,
          cls:        cls.toObject(),
          date:       today,
          students,
          type:       "preclass",
        });
      }

      digestSentLog.add(key);
      console.log(`✓ Digest sent for ${cls.id} on ${today} (${students.length} students)`);
    }
  } catch (err) {
    console.error("✗ Evening digest error:", err.message);
  }
},
{ scheduled: true, timezone: "America/New_York" });

// ── 8pm evening digest ────────────────────────────────────
// ── Waitlist: unanswered spot offers pass to the next person ──
cron.schedule("*/5 * * * *", async () => {
  try {
    const { expireOffers } = require("./utils/waitlist");
    const n = await expireOffers();
    if (n) console.log(`[cron] waitlist: ${n} offer(s) expired`);
  } catch (err) {
    console.error("[cron] waitlist expiry error:", err.message);
  }
});

cron.schedule("0 20 * * *", async () => {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.notificationsEnabled || !settings.adminEmails?.length || settings.notificationMode === "off") return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");

    const dayOfWeek = tomorrow.getDay();
    const classes = await Class.find({ dayOfWeek, active: { $ne: false }, $or: [{ endDate: null }, { endDate: { $gt: new Date() } }] });

    for (const cls of classes) {
      // No digest for classes that haven't started yet or for a cancelled date (web stores Class _id)
      if (cls.startDate && cls.startDate > dateStr) continue;
      if (await Cancellation.exists({ classId: { $in: [cls.id, String(cls._id)] }, date: dateStr })) continue;
      const bookings = await Booking.find({ classId: cls.id, date: dateStr, status: "confirmed" });
      const students = bookings.map(b => ({ studentName: b.studentName, studentEmail: b.studentEmail, paymentType: b.paymentType }));

      for (const email of await digestRecipients(cls, settings)) {
        await sendAdminDigest({ adminEmail: email, cls: cls.toObject(), date: dateStr, students, type: "evening" });
      }
      console.log(`✓ Evening digest sent for ${cls.id} on ${dateStr} (${students.length} students)`);
    }
  } catch (err) {
    console.error("✗ Evening digest error:", err.message);
  }
},
{ scheduled: true, timezone: "America/New_York" });

// ── 9am daily pass reminder check ───────────────────────
// Low balance: fires when classesRemaining === 1
//   - First send: 2+ days after droppedToOneAt
//   - Second send: 14+ days after first send
//   - Never more than 2 sends
// Expiry: fires once when expiresAt is within 14 days
cron.schedule("0 9 * * *", async () => {
  try {
    const Pass    = require("./models/Pass");
    const Student = require("./models/Student");
    const { sendPassReminderEmail } = require("./email");

    const now        = new Date();
    const in14days   = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const ago2days   = new Date(now.getTime() - 2  * 24 * 60 * 60 * 1000);
    const ago14days  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Candidate passes: active, non-membership, with either:
    //   - exactly 1 class remaining and droppedToOneAt set (low balance), OR
    //   - expiresAt within 14 days (expiry)
    const passes = await Pass.find({
      active: true,
      type:   { $nin: ["member2x", "memberUnl"] },
      $or: [
        // Low balance candidates
        {
          $expr: { $eq: [{ $subtract: ["$classesTotal", "$classesUsed"] }, 1] },
          droppedToOneAt: { $ne: null, $lte: ago2days },
          lowBalanceAlertCount: { $lt: 2 },
        },
        // Expiry candidates
        {
          expiresAt: { $lte: in14days, $gte: now },
          expiryAlertSentAt: null,
        },
      ],
    });

    for (const pass of passes) {
      const classesRemaining = pass.classesTotal !== null
        ? pass.classesTotal - pass.classesUsed
        : null;

      // ── Decide what fires for this pass ─────────────────
      let sendLowBalance = false;
      let sendExpiry     = false;

      // Low balance check
      if (
        classesRemaining === 1 &&
        pass.droppedToOneAt &&
        pass.lowBalanceAlertCount < 2
      ) {
        const lastSent = pass.lowBalanceAlertSentAt;
        const firstEver = !lastSent;
        const readyForFirst  = firstEver && pass.droppedToOneAt <= ago2days;
        const readyForSecond = !firstEver && lastSent <= ago14days;
        if (readyForFirst || readyForSecond) sendLowBalance = true;
      }

      // Expiry check
      if (pass.expiresAt && pass.expiresAt <= in14days && pass.expiresAt >= now && !pass.expiryAlertSentAt) {
        sendExpiry = true;
      }

      if (!sendLowBalance && !sendExpiry) continue;

      const student = await Student.findOne({ email: pass.studentEmail });

      await sendPassReminderEmail({
        studentEmail:      pass.studentEmail,
        studentName:       student?.name || pass.studentEmail,
        passType:          pass.type,
        classesRemaining,
        expiresAt:         pass.expiresAt,
      });

      // Stamp the fields we acted on
      const update = {};
      if (sendLowBalance) {
        update.lowBalanceAlertSentAt = now;
        update.lowBalanceAlertCount  = (pass.lowBalanceAlertCount || 0) + 1;
      }
      if (sendExpiry) {
        update.expiryAlertSentAt = now;
      }
      await pass.updateOne({ $set: update });

      const reasons = [
        sendLowBalance ? `${classesRemaining} class left (alert #${update.lowBalanceAlertCount})` : null,
        sendExpiry     ? `expires ${pass.expiresAt.toISOString().slice(0,10)}` : null,
      ].filter(Boolean).join(", ");

      console.log(`✓ Pass reminder sent to ${pass.studentEmail} (${pass.type} — ${reasons})`);
    }
  } catch (err) {
    console.error("✗ Pass reminder check error:", err.message);
  }
},
{ scheduled: true, timezone: "America/New_York" });

console.log("✓ Cron scheduler started");