const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  title:      { type: String, required: true },
  dayOfWeek:  { type: Number, required: true },
  startDate: { type: String, default: null }, // "YYYY-MM-DD", null = show always // 0=Sun, 6=Sat
  time:       { type: String, required: true }, // "HH:MM"
  duration:   { type: Number, required: true },
  teacher:    { type: String, required: true },
  venue:      { type: String, required: true },
  price:      { type: Number, required: true },
  isPrivate:  { type: Boolean, default: false },
  venueName:  { type: String, default: null },
  isHybrid: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Class", classSchema);