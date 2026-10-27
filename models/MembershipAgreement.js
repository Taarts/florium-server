const mongoose = require('mongoose');

const MembershipAgreementSchema = new mongoose.Schema({
  studentName:      { type: String, required: true },
  studentEmail:     { type: String, required: true, lowercase: true, trim: true },
  membershipType:   { type: String, required: true, enum: ['member2x', 'memberUnl'] },
  monthlyPrice:     { type: Number, required: true },
  signedAt:         { type: Date, default: Date.now },
  ip:               { type: String },
  studentSignature: { type: String },
  pdfS3Key:         { type: String },
}, { timestamps: true });

module.exports = mongoose.model('MembershipAgreement', MembershipAgreementSchema);
