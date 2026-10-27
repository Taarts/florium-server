const mongoose = require("mongoose");
const { STUDIO_ID } = require("../config/studio");

// Single-document collection — one settings record for the studio.
// Use Settings.getSingleton() everywhere rather than findOne() directly.

const settingsSchema = new mongoose.Schema(
  {
    studio: {
      type:    String,
      default: STUDIO_ID,
      unique:  true,
    },
    // List of emails that receive admin notifications
    adminEmails: {
      type:    [String],
      default: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [],
    },
    // Master toggle — if false, no admin notifications are sent
    notificationsEnabled: {
      type:    Boolean,
      default: true,
    },
    // "digest" — roster email 30 mins before class + 8pm evening digest
    // "off"    — no scheduled digests (cancellations still send if enabled)
    notificationMode: {
      type:    String,
      enum:    ["digest", "off"],
      default: "digest",
    },
    classTypes: {
      type:    [{ name: String, color: String, _id: false }],
      default: [],
    },
    announcementText: {
      type:    String,
      default: "",
    },
    announcementUrl: {
      type: String,
      default: "",
    },
    announcementLinkText: {
      type: String,
      default: "",
    },
    announcementActive: {
      type:    Boolean,
      default: false,
    },
    // Class capacity defaults for new classes (the class form reads these)
    defaultCap:             { type: Number,  default: null },
    defaultWaitlistEnabled: { type: Boolean, default: false },
    // Hours a spot is held for the person emailed from the waitlist (never past class start)
    waitlistHoldHours:      { type: Number,  default: 12, min: 1, max: 72 },
  },
  { timestamps: true }
);

settingsSchema.statics.getSingleton = async function (studio = STUDIO_ID) {
  let settings = await this.findOne({ studio });
  if (!settings) settings = await this.create({ studio });
  return settings;
};

module.exports = mongoose.model("Settings", settingsSchema);
