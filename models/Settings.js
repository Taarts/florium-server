const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    adminEmails: {
      type:    [String],
      default: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [],
    },
    notificationsEnabled: {
      type:    Boolean,
      default: true,
    },
    notificationMode: {
      type:    String,
      enum:    ["digest", "off"],
      default: "digest",
    },
    announcementText: {
      type:    String,
      default: "",
    },
    announcementActive: {
      type:    Boolean,
      default: false,
    },
    defaultCap: {
      type:    Number,
      default: null,
    },
    defaultWaitlistEnabled: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

settingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne();
  if (!settings) settings = await this.create({});
  return settings;
};

module.exports = mongoose.model("Settings", settingsSchema);
