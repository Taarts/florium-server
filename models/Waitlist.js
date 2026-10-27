const mongoose = require("mongoose");

const waitlistSchema = new mongoose.Schema({
  classId:      { type: String, required: true },
  date:         { type: String, required: true },
  studentEmail: { type: String, required: true },
  studentName:  { type: String, default: "" },
  position:     { type: Number, required: true },
  // "waiting" → in line · "offered" → a spot is held for them until holdUntil
  status:       { type: String, enum: ["waiting", "offered"], default: "waiting", index: true },
  offeredAt:    { type: Date, default: null },
  holdUntil:    { type: Date, default: null },
  token:        { type: String, default: null }, // secret for the Confirm / Cancel page
  createdAt:    { type: Date, default: Date.now }
});

waitlistSchema.index({ classId: 1, date: 1, studentEmail: 1 }, { unique: true });
waitlistSchema.index({ token: 1 }, { unique: true, partialFilterExpression: { token: { $type: "string" } } });

module.exports = mongoose.model("Waitlist", waitlistSchema);
