const mongoose = require("mongoose");

const venueSchema = new mongoose.Schema(
  {
    id:       { type: String, required: true, unique: true },
    name:     { type: String, required: true },
    address:  { type: String, default: null },
    mapsLink: { type: String, default: null },
    capacity: { type: Number, default: null },
    active:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Venue", venueSchema);
