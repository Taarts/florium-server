const mongoose = require("mongoose");

// Admin-held time on the calendar: no student, no pass, no price.
const blockSchema = new mongoose.Schema(
  {
    date:     { type: String, required: true },          // YYYY-MM-DD
    time:     { type: String, required: true },          // HH:MM (24h)
    duration: { type: Number, required: true, default: 60 }, // minutes
    note:     { type: String, default: "", trim: true }, // admin-only
  },
  { timestamps: true }
);

blockSchema.index({ date: 1, time: 1 });

module.exports = mongoose.model("Block", blockSchema);
