const mongoose = require("mongoose");

const rentalSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    studentEmail: { type: String, required: true, lowercase: true, trim: true },
    stripePaymentIntentId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true }, // cents
    expiresAt: { type: Date, required: true },
    couponCode: { type: String, default: null },
  },
  { timestamps: true }
);

rentalSchema.index({ video: 1, studentEmail: 1, expiresAt: 1 });

module.exports = mongoose.model("Rental", rentalSchema);