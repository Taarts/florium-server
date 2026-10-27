const mongoose = require("mongoose");

const membershipRenewalSchema = new mongoose.Schema({
  passId:               { type: mongoose.Schema.Types.ObjectId, ref: "Pass", required: true },
  passCode:             { type: String, required: true },
  type:                 { type: String, required: true }, // "member2x" | "memberUnl"
  studentEmail:         { type: String, required: true },
  stripeSubscriptionId: { type: String, required: true },
  stripeInvoiceId:      { type: String, required: true },
  amountPaid:           { type: Number, required: true }, // dollars
  periodEnd:            { type: Date, required: true },
  paidAt:               { type: Date, required: true },
  isInitial:            { type: Boolean, default: false }, // true = first payment, false = renewal
}, { timestamps: true });

// Natural dedup: Stripe invoice IDs are unique per payment, so this index
// makes re-processing the same webhook event a safe no-op via findOneAndUpdate upsert.
membershipRenewalSchema.index({ stripeInvoiceId: 1 }, { unique: true });
membershipRenewalSchema.index({ type: 1, paidAt: 1 });

module.exports = mongoose.model("MembershipRenewal", membershipRenewalSchema);
