const mongoose = require("mongoose");

const overrideSchema = new mongoose.Schema({
  classId: { type: String, required: true },
  date:    { type: String, required: true }, // "YYYY-MM-DD"
  venue:   { type: String, required: true },
}, { timestamps: true });

overrideSchema.index({ classId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Override", overrideSchema);