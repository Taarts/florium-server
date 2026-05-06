const mongoose = require("mongoose");

const workshopSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  title:       { type: String, required: true },
  teacher:     { type: String, default: "" },
  description: { type: String, default: "" },
  days: [{
    date:     String,
    venue:    String,
    sessions: [{
      id:       String,
      label:    String,
      time:     String,
      duration: Number,
      price:    Number,
    }]
  }],
  pricing: {
    perSession:   { type: Number, default: 0 },
    fullDay:      { type: Number, default: 0 },
    fullWorkshop: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model("Workshop", workshopSchema);