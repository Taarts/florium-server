const mongoose = require("mongoose");

// A saved Social tab post: teacher drafts → owner approval → posted (same flow as Newsletters).
// `form` is the Social tab's editor state as-is, so a draft reopens exactly as it was written.

const authorSchema = new mongoose.Schema(
  {
    userId: { type: String, default: null },
    name:   { type: String, default: "" },
    email:  { type: String, default: "" },
    role:   { type: String, default: "" },     // "owner" | "teacher"
  },
  { _id: false }
);

const socialPostSchema = new mongoose.Schema(
  {
    studio:  { type: String, default: null },   // whose accounts it posts from (null on single-studio servers)
    form:    { type: mongoose.Schema.Types.Mixed, default: {} },
    summary: { type: String, default: "" },     // list label: start of the text / card title
    thumb:   { type: String, default: "" },     // list thumbnail: card photo, first photo or video poster
    link:    { type: String, default: "" },     // booking link (list filter: workshop links)

    // draft → (teacher) submitted → (owner) posting → posted | failed
    status: {
      type: String,
      enum: ["draft", "submitted", "posting", "posted", "failed"],
      default: "draft",
      index: true,
    },

    createdBy:   { type: authorSchema, default: null },
    submittedAt: { type: Date, default: null },
    reviewNote:  { type: String, default: "" },   // owner's note when returning it to the teacher

    postedBy: { type: authorSchema, default: null },
    postedAt: { type: Date, default: null },
    results:  { type: mongoose.Schema.Types.Mixed, default: null },   // { facebook: { ok, url|error }, … }
    error:    { type: String, default: "" },
  },
  { timestamps: true }
);

socialPostSchema.index({ studio: 1, createdAt: -1 });
socialPostSchema.index({ "createdBy.userId": 1, createdAt: -1 });

module.exports = mongoose.model("SocialPost", socialPostSchema);
