const mongoose = require("mongoose");

const cancellationSchema = new mongoose.Schema({
  classId: { type: String, required: true },
  date:    { type: String, required: true }, // "YYYY-MM-DD"
}, { timestamps: true });

cancellationSchema.index({ classId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Cancellation", cancellationSchema);