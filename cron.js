const cron     = require("node-cron");
const Booking  = require("./models/Booking");
const Class    = require("./models/Class");
const Settings = require("./models/Settings");
const Teacher  = require("./models/Teacher");
const { sendAdminDigest } = require("./email");

const digestSentLog = new Set();

// ── 8pm evening digest ────────────────────────────────────
cron.schedule("0 0 * * *", async () => {
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
    const classes = await Class.find({ dayOfWeek, active: { $ne: false } });

    for (const cls of classes) {
      const bookings = await Booking.find({ classId: cls.id, date: dateStr, status: "confirmed" });
      const students = bookings.map(b => ({ studentName: b.studentName, studentEmail: b.studentEmail, paymentType: b.paymentType }));
      const teacher = cls.teacher ? await Teacher.findOne({ name: new RegExp(`^${cls.teacher}$`, "i"), active: true }) : null;
      const ccEmails = teacher?.email ? [{ email: teacher.email }] : [];

      for (const email of settings.adminEmails) {
        await sendAdminDigest({ adminEmail: email, cls: cls.toObject(), date: dateStr, students, type: "evening", cc: ccEmails });
      }
      console.log(`✓ Evening digest sent for ${cls.id} on ${dateStr} (${students.length} students)`);
    }
  } catch (err) {
    console.error("✗ Evening digest error:", err.message);
  }
});

// ── 30-min pre-class reminder ─────────────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.notificationsEnabled || !settings.adminEmails?.length || settings.notificationMode === "off") return;

    const now     = new Date(new Date().getTime() - 4 * 60 * 60 * 1000); // offset UTC → EDT
    const soon    = new Date(now.getTime() + 30 * 60 * 1000);
    const soonEnd = new Date(now.getTime() + 31 * 60 * 1000);

    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const classes = await Class.find({});

    for (const cls of classes) {
      const [hours, minutes] = cls.time.split(":").map(Number);
      const classStart = new Date(`${today}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
      if (classStart < soon || classStart >= soonEnd) continue;

      const key = `${cls.id}|${today}`;
      if (digestSentLog.has(key)) continue;

      const bookings = await Booking.find({ classId: cls.id, date: today, status: "confirmed" });
      const students = bookings.map(b => ({ studentName: b.studentName, studentEmail: b.studentEmail, paymentType: b.paymentType }));
      const teacher = cls.teacher ? await Teacher.findOne({ name: new RegExp(`^${cls.teacher}$`, "i"), active: true }) : null;
      const ccEmails = teacher?.email ? [{ email: teacher.email }] : [];

      for (const email of settings.adminEmails) {
        await sendAdminDigest({ adminEmail: email, cls: cls.toObject(), date: today, students, type: "preclass", cc: ccEmails });
      }

      digestSentLog.add(key);
      console.log(`✓ Pre-class digest sent for ${cls.id} on ${today} (${students.length} students)`);
    }
  } catch (err) {
    console.error("✗ Cron digest error:", err.message);
  }
});

console.log("✓ Cron scheduler started");
