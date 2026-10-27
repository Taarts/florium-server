const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  title:      { type: String, required: true },
  dayOfWeek:  { type: Number, required: true },
  startDate: { type: String, default: null },
  endDate:   { type: String, default: null }, // "YYYY-MM-DD", null = show always // 0=Sun, 6=Sat
  time:       { type: String, required: true }, // "HH:MM"
  duration:   { type: Number, required: true },
  teacher:    { type: String, required: true },
  subject:     { type: String, default: "" },   // e.g. Iyengar, Vinyasa, Yin
  description: { type: String, default: "" },
  image:       { type: String, default: "" },   // "/uploads/images/…" or absolute URL
  venue:      { type: String, required: true },
  price:      { type: Number, required: true },
  priceMin:   { type: Number, default: null },
  priceMax:   { type: Number, default: null },
  isPrivate:  { type: Boolean, default: false },
  ratePerStudent: { type: Number, default: 0 },
  ceiling: { type: Number, default: 0 },
  cap:             { type: Number, default: null },
  waitlistEnabled: { type: Boolean, default: false },
  venueName:  { type: String, default: null },
  isHybrid: { type: Boolean, default: false },
  studio:     { type: String, enum: require("../config/studio").STUDIOS, required: true, default: require("../config/studio").STUDIO_ID },
}, { timestamps: true });

module.exports = mongoose.model("Class", classSchema);