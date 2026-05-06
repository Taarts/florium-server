const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    studentEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    classId: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["dropin", "pass4", "pass8", "member2x", "memberUnl", "private1", "private3", "private10"],
      required: true,
    },
    passId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pass",
      default: null,
    },
    acuityAppointmentId: {
      type: Number,
      default: null,
    },
    stripePaymentId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "no-show"],
      default: "confirmed",
    },
    // ── Check-in fields (added for R1 Check-in reporting) ────
    checkedIn: {
      type: Boolean,
      default: false,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    // ── Workshop fields ──────────────────────────────────────
    workshopTitle: { type: String, default: null },
    sessionLabel:  { type: String, default: null },
    sessionTime:   { type: String, default: null },
  },
  { timestamps: true }
);

// Prevent double-booking: one confirmed booking per student per class per date
bookingSchema.index(
  { studentEmail: 1, classId: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);

module.exports = mongoose.model("Booking", bookingSchema);
