const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  teacher:   { type: String, required: true },
  dayOfWeek: { type: Number, required: true }, // 0=Sun
  time:      { type: String, required: true }, // "HH:MM"
  duration:  { type: Number, required: true }, // minutes
  venue:     { type: String, required: true },
  price:     { type: Number, default: 25 },
  isPrivate: { type: Boolean, default: false },
  startDate: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Class", classSchema);