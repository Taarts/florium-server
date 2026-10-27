const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  teacher: { type: String },
  subject: { type: String },
  durationSeconds: { type: Number },
  bunnyVideoId: { type: String, required: true },
  thumbnailUrl: { type: String },
  source: { type: String, enum: ['zoom_recording', 'direct_upload'], default: 'direct_upload' },
  isPublished: { type: Boolean, default: false },
  classId: { type: String },   // links this recording to the class it was recorded from
  classDate: { type: String }, // e.g. "2026-02-01" — matches Booking.date format, used to pull the roster
  createdAt: { type: Date, default: Date.now },
  uploadedAt: { type: Date },
});

module.exports = mongoose.model('Video', videoSchema);
