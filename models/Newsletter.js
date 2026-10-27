const mongoose = require("mongoose");

const authorSchema = new mongoose.Schema(
  {
    userId: { type: String, default: null },   // User _id (null = legacy admin secret)
    name:   { type: String, default: "" },
    email:  { type: String, default: "" },
    role:   { type: String, default: "" },     // "owner" | "teacher"
  },
  { _id: false }
);

const newsletterSchema = new mongoose.Schema(
  {
    subject:     { type: String, required: true, trim: true },
    previewText: { type: String, trim: true, default: "" },   // inbox preview line
    audience:    { type: String, enum: ["all", ...require("../config/studio").STUDIOS], default: "all" },
    brand:       { type: String, default: "" },               // studio whose admin wrote it ("All students" branding)
    headerTitle: { type: String, trim: true, default: "" },   // blank → studio name
    headerColor: { type: String, trim: true, default: "" },   // blank → studio colour
    greeting:    { type: Boolean, default: true },            // "Hi {first name},"
    signatureId: { type: String, default: "default" },        // "default" | "none" | Signature _id
    blocks:      { type: [mongoose.Schema.Types.Mixed], default: [] },

    // Legacy plain-text body (first version) — no longer used
    bodyText:    { type: String, default: "" },

    // draft → (teacher) submitted → (owner) sending → sent
    status: {
      type: String,
      enum: ["draft", "submitted", "sending", "sent", "failed"],
      default: "draft",
      index: true,
    },

    // ── Authoring / approval ───────────────────────────────
    createdBy:   { type: authorSchema, default: null },       // null on newsletters made before teacher access
    submittedAt: { type: Date, default: null },
    reviewNote:  { type: String, default: "" },                // owner's note when returning to the teacher

    // ── Brevo campaign ─────────────────────────────────────
    brevoCampaignId: { type: Number, default: null },
    sentAt:          { type: Date, default: null },
    sendError:       { type: String, default: null },
    stats:           { type: mongoose.Schema.Types.Mixed, default: null },  // cached Brevo globalStats
    statsAt:         { type: Date, default: null },

    // ── Test sends ─────────────────────────────────────────
    lastTestSentAt: { type: Date, default: null },
    lastTestSentTo: { type: String, default: null },
  },
  { timestamps: true }
);

newsletterSchema.index({ "createdBy.userId": 1, createdAt: -1 });

module.exports = mongoose.model("Newsletter", newsletterSchema);
