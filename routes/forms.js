// routes/forms.js — branded site forms (replaces the Google Forms).
// Same flow as IYCU: validate → save to Mongo → respond immediately →
// fire-and-forget Google Sheets webhook + emails. A Sheets or email
// failure never loses a submission; the Mongo record is the source of truth.

const express   = require("express");
const router    = express.Router();
const rateLimit = require("express-rate-limit");

const FormSubmission = require("../models/FormSubmission");
const { sendFormSubmissionEmails } = require("../email");
const adminAuth = require("../middleware/auth");

// Server-side whitelist. Titles are used in emails and the Sheets tab name.
// Keep slugs in sync with iy-sp-react/src/pages/forms/formSchemas.js.
const FORMS = {
  intake:         { title: "Yoga Therapy Intake Form", emailRequired: true },
  "pre-session":  { title: "Pre-Session Form",         emailRequired: true },
  "post-session": { title: "Post-Session Form",        emailRequired: true },
  celebration:    { title: "Opening Celebration RSVP", emailRequired: false },
};

const MAX_ANSWERS   = 150;
const MAX_TEXT      = 5000;
const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions — please try again later." },
});

const clip = (v) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : v);

// Accept only the shapes the form renderer produces; drop anything else.
function cleanAnswers(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, MAX_ANSWERS).flatMap((x) => {
    if (!x || typeof x.id !== "string" || typeof x.q !== "string") return [];
    let a = x.a;
    if (typeof a === "string") a = clip(a.trim());
    else if (Array.isArray(a)) a = a.filter((v) => typeof v === "string").map(clip).slice(0, 100);
    else if (a && typeof a === "object") {
      a = Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === "string").slice(0, 50).map(([k, v]) => [clip(k), clip(v)]));
    } else a = "";
    return [{ id: x.id.slice(0, 80), q: clip(x.q), a }];
  });
}

// Plain-text value for Sheets / email rows.
function flatten(a) {
  if (Array.isArray(a)) return a.join(", ");
  if (a && typeof a === "object") return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join("; ");
  return a ?? "";
}

async function appendToSheet(payload) {
  const url = process.env.FORMS_SHEETS_WEBHOOK_URL;
  if (!url) return; // optional — not configured yet
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: process.env.FORMS_SHEETS_TOKEN, ...payload }),
  });
  if (!res.ok) throw new Error(`Sheets webhook responded ${res.status}`);
  // Apps Script answers 200 even on failure; the real result is in the JSON body.
  const out = await res.json().catch(() => null);
  if (!out || out.ok !== true) throw new Error(`Sheets webhook rejected: ${out ? out.error : "non-JSON response (check the deployment URL / access = Anyone)"}`);
}

/* ─────────────────────────────────────────
   POST /api/forms/:slug/submit
   Body: { name, email, answers: [{ id, q, a }] }
───────────────────────────────────────── */
router.post("/:slug/submit", submitLimiter, async (req, res) => {
  const def = FORMS[req.params.slug];
  if (!def) return res.status(404).json({ error: "Unknown form." });

  try {
    const name  = typeof req.body.name === "string" ? req.body.name.trim().slice(0, 200) : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 200) : "";
    const answers = cleanAnswers(req.body.answers);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (def.emailRequired && !email) return res.status(400).json({ error: "Email is required." });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!answers) return res.status(400).json({ error: "Missing answers." });

    const doc = await FormSubmission.create({
      form: req.params.slug, name, email: email || undefined, answers, ip: req.ip,
    });

    res.status(201).json({ ok: true });

    /* ── Non-blocking from here ── */
    const rows = answers.map(({ q, a }) => ({ q, a: flatten(a) }));
    const timestamp = doc.submittedAt.toLocaleString("en-US", { timeZone: "America/New_York" });

    appendToSheet({ formType: req.params.slug, formTitle: def.title, timestamp, name, email, answers: rows })
      .catch((err) => console.error(`[forms/${req.params.slug}] Sheets error:`, err.message));

    sendFormSubmissionEmails({ formTitle: def.title, name, email, rows, submittedAt: doc.submittedAt })
      .catch((err) => console.error(`[forms/${req.params.slug}] Email error:`, err.message));
  } catch (err) {
    console.error(`[forms/${req.params.slug}]`, err);
    if (!res.headersSent) res.status(500).json({ error: "Server error — please try again." });
  }
});

/* ─────────────────────────────────────────
   GET /api/forms?form=intake&email=&page=  (admin)
───────────────────────────────────────── */
router.get("/", adminAuth, async (req, res) => {
  try {
    const q = {};
    if (req.query.form)  q.form  = String(req.query.form);
    if (req.query.email) q.email = String(req.query.email).toLowerCase().trim();
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    const [items, total] = await Promise.all([
      FormSubmission.find(q).sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).select("-__v -ip"),
      FormSubmission.countDocuments(q),
    ]);
    res.json({ total, page, pages: Math.ceil(total / limit), items });
  } catch (err) {
    console.error("[forms admin list]", err);
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
