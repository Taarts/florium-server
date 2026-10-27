const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code:           { type: String, required: true, unique: true, uppercase: true, trim: true },
  type:           { type: String, enum: ["percent", "fixed"], required: true },
  amount:         { type: Number, required: true },
  appliesToTypes: { type: [String], default: [] },
  maxUses:        { type: Number, default: 0 },
  usedCount:      { type: Number, default: 0 },
  expiresAt:      { type: Date, default: null },
  active:         { type: Boolean, default: true },
  membersOnly:    { type: Boolean, default: false }, // legacy: = both memberships
  allowedEmails:  { type: [{ type: String, lowercase: true, trim: true }], default: [] },
  allowedMemberships: { type: [String], default: [] }, // 'member2x' | 'memberUnl'
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema);
