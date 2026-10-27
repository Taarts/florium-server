const mongoose = require("mongoose");

const signatureSchema = new mongoose.Schema(
  {
    label:     { type: String, required: true, trim: true },   // "Owner", "Studio Manager" — admin only
    signOff:   { type: String, trim: true, default: "" },      // "Warmly,"
    name:      { type: String, required: true, trim: true },
    title:     { type: String, trim: true, default: "" },      // role shown under the name
    photo:     { type: String, trim: true, default: "" },      // square headshot URL
    phone:     { type: String, trim: true, default: "" },
    email:     { type: String, trim: true, default: "" },
    website:   { type: String, trim: true, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Signature", signatureSchema);
