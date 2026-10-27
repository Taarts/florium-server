const mongoose = require("mongoose");

const PASS_TYPES = [
                    "dropin",
                    "pass4", 
                    "pass8", 
                    "member2x", 
                    "memberUnl", 
                    "private1", 
                    "private3", 
                    "private10",
                    "videoSub"
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
    // Stripe payment reference (one-time passes)
    stripeSessionId: {
      type: String,
    },
    stripePaymentId: {
      type: String,
    },
    // Stripe references (memberships / subscriptions)
    stripeCustomerId: {
      type: String,
    },
    stripeSubscriptionId: {
      type: String,
    },
    // For subscriptions: end of the current paid period (also used as expiresAt for memberships)
    currentPeriodEnd: {
      type: Date,
    },
    // Amount actually paid (after discounts, Zelle, etc.)
    amountPaid: {
      type: Number,
      default: null,
    },

    // Admin notes
    notes: {
      type: String,
    },

    // Purchase status — used to filter revenue reports
    // "pending"  : Stripe charge initiated, pass created, not yet confirmed end-to-end
    // "complete" : Email sent successfully — purchase fully confirmed
    // "admin"    : Created manually by admin (no Stripe flow)
    purchaseStatus: {
      type: String,
      enum: ["pending", "complete", "admin", "comp"],
      default: "admin",
    },

    // ── Pass reminder tracking ─────────────────────────────
    // Set when classesRemaining first drops to 1
    droppedToOneAt: {
      type: Date,
      default: null,
    },
    // Low-balance reminders (classesRemaining === 1): max 2 sends
    lowBalanceAlertSentAt: {
      type: Date,
      default: null,
    },
    lowBalanceAlertCount: {
      type: Number,
      default: 0,
    },
    // Expiry reminder (≤14 days): send once
    expiryAlertSentAt: {
      type: Date,
      default: null,
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

// ── Static: atomically use n classes ─────────────────────
// Returns the updated pass, or null if inactive / not enough classes left.
passSchema.statics.consume = async function (passId, n = 1) {
  const updated = await this.findOneAndUpdate(
    {
      _id: passId,
      active: true,
      $or: [
        { classesTotal: null },
        { $expr: { $lte: [{ $add: ["$classesUsed", n] }, "$classesTotal"] } },
      ],
    },
    { $inc: { classesUsed: n } },
    { new: true }
  );
  if (!updated) return null;
  const set = {};
  if (updated.classesTotal !== null && updated.classesUsed >= updated.classesTotal) set.active = false;
  if (updated.classesTotal !== null && updated.classesTotal - updated.classesUsed === 1 && !updated.droppedToOneAt)
    set.droppedToOneAt = new Date();
  if (Object.keys(set).length) {
    await this.updateOne({ _id: passId }, { $set: set });
    Object.assign(updated, set);
  }
  return updated;
};

// ── Static: give back n classes (cancellations) ──────────
// Reactivates only if the pass had been auto-deactivated by being used up.
passSchema.statics.release = async function (passId, n = 1) {
  const updated = await this.findOneAndUpdate(
    { _id: passId, classesUsed: { $gte: n } },
    { $inc: { classesUsed: -n } },
    { new: true }
  );
  if (updated && !updated.active && updated.classesTotal !== null &&
      updated.classesUsed + n >= updated.classesTotal &&
      updated.classesUsed < updated.classesTotal &&
      (!updated.expiresAt || updated.expiresAt > new Date())) {
    await this.updateOne({ _id: passId }, { $set: { active: true } });
    updated.active = true;
  }
  return updated;
};

module.exports = mongoose.model("Pass", passSchema);
