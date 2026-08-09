const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },

    // ── Address fields (R2 First Visits reporting) ─────────
    address:   { type: String, trim: true, default: null },
    city:      { type: String, trim: true, default: null },
    state:     { type: String, trim: true, uppercase: true, default: null },
    zip:       { type: String, trim: true, default: null },
    isLocal:   { type: Boolean, default: null },
    county:    { type: String, default: null },
    firstVisit:{ type: Date, default: null },

    // ── Waiver fields ──────────────────────────────────────
    waiverSigned:    { type: Boolean, default: false },
    waiverSignedAt:  { type: Date,    default: null },
    waiverIp:        { type: String,  default: null },
    waiverSignature: { type: String,  default: null }, // base64 PNG data URL
    waiverPdfPath:   { type: String,  default: null }, // server file path

    notes:          { type: String },
    smsOptIn:       { type: Boolean, default: false },
    smsOptInAt:     { type: Date, default: null },
    acuityClientId: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
