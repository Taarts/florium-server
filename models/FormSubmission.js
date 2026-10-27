const mongoose = require("mongoose");

// One document per submission of a branded site form (/forms/:slug).
// answers keeps the question text alongside each value so old submissions
// stay readable even if a form's wording changes later.
const AnswerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  q:  { type: String, required: true },
  a:  { type: mongoose.Schema.Types.Mixed }, // string | string[] | { row: col }
}, { _id: false });

const FormSubmissionSchema = new mongoose.Schema({
  form:        { type: String, required: true, index: true },
  name:        { type: String, required: true, trim: true },
  email:       { type: String, lowercase: true, trim: true, index: true },
  answers:     { type: [AnswerSchema], default: [] },
  submittedAt: { type: Date, default: Date.now, index: true },
  ip:          { type: String },
}, { timestamps: true });

module.exports = mongoose.model("FormSubmission", FormSubmissionSchema);
