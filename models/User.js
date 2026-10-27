const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
    name:         { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role:         { type: String, enum: ["owner", "teacher"], required: true, default: "teacher" },
    studios:      [{ type: String, enum: require("../config/studio").STUDIOS }],
    teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
    active:       { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },   // bump to revoke all issued tokens
    lastLoginAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
