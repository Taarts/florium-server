const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, trim: true, lowercase: true },
    payRate:  { type: Number, default: 0 },
    bio:      { type: String, default: "" },
    image:    { type: String, default: "" },
    active:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Teacher", teacherSchema);
