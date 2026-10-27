// Teacher scoping. A teacher's classes are those whose `teacher` text matches the
// name on their linked Teacher record (case-insensitive). Owners are unscoped (null).
const Teacher = require("../models/Teacher");
const Class   = require("../models/Class");
const Booking = require("../models/Booking");

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function teacherRecord(user) {
  if (!user?.teacherId) return null;
  return Teacher.findById(user.teacherId, "name email").lean();
}

async function scopedClassIds(user) {
  if (!user) return [];
  if (user.role === "owner") return null;
  const t    = await teacherRecord(user);
  const name = t?.name?.trim();
  if (!name) return [];
  const classes = await Class.find({ teacher: new RegExp(`^\\s*${esc(name)}\\s*$`, "i") }, "id").lean();
  return classes.map(c => c.id);
}

async function canAccessClass(user, classId) {
  const ids = await scopedClassIds(user);
  return ids === null || (Boolean(classId) && ids.includes(classId));
}

async function scopedStudentEmails(user) {
  const ids = await scopedClassIds(user);
  if (ids === null) return null;
  if (!ids.length) return [];
  return Booking.distinct("studentEmail", { classId: { $in: ids } });
}

async function canAccessStudent(user, email) {
  const emails = await scopedStudentEmails(user);
  return emails === null || emails.includes(String(email || "").toLowerCase().trim());
}

module.exports = { teacherRecord, scopedClassIds, canAccessClass, scopedStudentEmails, canAccessStudent };
