const mongoose = require("mongoose");

const PASS_TYPES = [
                    "dropin",
                    "pass4", 
                    "pass8", 
                    "member2x", 
                    "memberUnl", 
                    "private1", 
                    "private3", 
                    "private10"
                   ];

const passSchema = new mongoose.Schema(
  {
    // The code students enter at booking — generated when pass is sold
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: PASS_TYPES,
      required: true,
    },
    // Student the pass belongs to
    studentEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    // null = unlimited (memberships)
    classesTotal: {
      type: Number,
      default: null,
    },
    classesUsed: {
      type: Number,
      default: 0,
    },
    // null = no expiry (memberships managed via cancellation)
    expiresAt: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Stripe payment reference
    stripePaymentId: {
      type: String,
    },
    // Admin notes
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

// ── Virtual: classes remaining ─────────────────────────────
passSchema.virtual("classesRemaining").get(function () {
  if (this.classesTotal === null) return null; // unlimited
  return Math.max(0, this.classesTotal - this.classesUsed);
});

// ── Method: is this pass valid for booking? ────────────────
passSchema.methods.isValid = function () {
  if (!this.active) return { valid: false, reason: "Pass is no longer active." };
  if (this.expiresAt && new Date() > this.expiresAt)
    return { valid: false, reason: "Pass has expired." };
  if (this.classesTotal !== null && this.classesUsed >= this.classesTotal)
    return { valid: false, reason: "No classes remaining on this pass." };
  return { valid: true };
};

// ── Static: find by code OR email ─────────────────────────
passSchema.statics.findByCodeOrEmail = async function (input) {
  const normalised = input.trim().toLowerCase();
  const isEmail    = normalised.includes("@");

  if (isEmail) {
    // Return the most recently created active pass for this email
    return this.findOne({ studentEmail: normalised, active: true })
      .sort({ createdAt: -1 });
  } else {
    return this.findOne({ code: input.trim().toUpperCase() });
  }
};

module.exports = mongoose.model("Pass", passSchema);
