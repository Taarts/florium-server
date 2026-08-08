const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  subject:   { type: String, default: "" },
  teacher:   { type: String, required: true },
  teacherId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'Teacher', default: null },
  dayOfWeek: { type: Number, required: true }, // 0=Sun
  time:      { type: String, required: true }, // "HH:MM"
  duration:  { type: Number, required: true }, // minutes
  venue:     { type: String, required: true },
  price:     { type: Number, default: 25 },
  isPrivate: { type: Boolean, default: false },
  isHybrid: { type: Boolean, default: false },
  startDate:      { type: String, default: null },
  endDate:        { type: String, default: null },
  ratePerStudent: { type: Number, default: 0 },
  ceiling:        { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Class", classSchema);