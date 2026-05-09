const express   = require("express");
const router    = express.Router();
const Pass      = require("../models/Pass");
const adminAuth = require("../middleware/auth");
const EXPIRY_DAYS = {
  pass4: 60,
  pass8: 90,
};

// ── POST /api/passes/verify ────────────────────────────────
// Called when student enters a code or email in the booking modal.
// Returns pass info if valid, or a clear reason if not.
router.post("/verify", async (req, res, next) => {
  try {
    const { input } = req.body;
    if (!input)
      return res.status(400).json({ error: "Code or email is required." });

    const pass = await Pass.findByCodeOrEmail(input);

    if (!pass) {
      return res.status(404).json({
        valid: false,
        reason: "No pass or membership found for that code or email.",
      });
    }

    const { valid, reason } = pass.isValid();
    if (!valid) {
      return res.status(200).json({ valid: false, reason });
    }

    // Return enough info for the UI to show the student what they have
    res.json({
      valid: true,
      pass: {
        id:               pass._id,
        type:             pass.type,
        classesRemaining: pass.classesRemaining,
        expiresAt:        pass.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/passes/redeem ────────────────────────────────
// Called after a successful pass booking.
// Increments classesUsed by 1.
router.post("/redeem", async (req, res, next) => {
  try {
    const { passId } = req.body;
    if (!passId)
      return res.status(400).json({ error: "passId is required." });

    const pass = await Pass.findById(passId);
    if (!pass)
      return res.status(404).json({ error: "Pass not found." });

    const { valid, reason } = pass.isValid();
    if (!valid)
      return res.status(400).json({ valid: false, reason });

    // Increment usage (memberships track usage but aren't limited)
    pass.classesUsed += 1;

    // Auto-deactivate if fully used
    if (pass.classesTotal !== null && pass.classesUsed >= pass.classesTotal) {
      pass.active = false;
    }

    await pass.save();

    res.json({
      success: true,
      classesRemaining: pass.classesRemaining,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/passes (admin only) ─────────────────────────
// Admin creates a new pass for a student (after payment via
// Acuity or in person). Generates a unique code automatically.
router.post("/", adminAuth, async (req, res, next) => {
  try {
     const body = req.body;
    const { type, studentEmail, classesTotal, notes } = req.body;

    // Generate a readable 8-char code e.g. "YOGA-A3F2"
    const code = "YOGA-" + Math.random().toString(36).slice(2, 6).toUpperCase();
     if (!body.expiresAt && EXPIRY_DAYS[body.type]) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + EXPIRY_DAYS[body.type]);
      body.expiresAt = expiry;
    }
    const pass = await Pass.create({
      code,
      type,
      studentEmail: studentEmail.toLowerCase().trim(),
      classesTotal: classesTotal ?? null,
      expiresAt:    body.expiresAt   ?? null,
      notes,
    });

    res.status(201).json({ pass });
  } catch (err) {
    next(err);
  }
});
// GET /api/passes/active?email=student@email.com
router.get('/active', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const pass = await Pass.findOne({
      studentEmail: email.toLowerCase().trim(),
      active: true,
      type: { $nin: ['dropin'] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }).sort({ createdAt: -1 });

    if (!pass) return res.json({ pass: null });

    res.json({
      pass: {
        id: pass._id,
        code: pass.code,
        type: pass.type,
        classesRemaining: pass.classesTotal - pass.classesUsed
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── GET /api/passes (admin only) ──────────────────────────
// List all passes — filterable by email or active status.
router.get("/", adminAuth, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.email)  filter.studentEmail = req.query.email.toLowerCase();
    if (req.query.active) filter.active = req.query.active === "true";

    const passes = await Pass.find(filter).sort({ createdAt: -1 });
    res.json({ passes });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/passes/:id (admin only) ────────────────────
// Admin edits a pass — e.g. extend expiry, add classes, deactivate.
router.patch("/:id", adminAuth, async (req, res, next) => {
  try {
    const allowed = ["classesTotal", "expiresAt", "active", "notes"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const pass = await Pass.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!pass)
      return res.status(404).json({ error: "Pass not found." });

    res.json({ pass });
  } catch (err) {
    next(err);
  }

});

// ── POST /api/passes/purchase (public) ────────────────────
// Student purchases a pass via Stripe. Creates pass + sends email.
router.post("/purchase", async (req, res, next) => {
  try {
    const { name, email, passType, stripePaymentId } = req.body;
    if (!name || !email || !passType || !stripePaymentId)
      return res.status(400).json({ error: "Missing required fields." });

    const PASS_CONFIG = {
      dropin: { classesTotal: 1,    expiryDays: null },
      pass4:  { classesTotal: 4,    expiryDays: 60   },
      pass8:  { classesTotal: 8,    expiryDays: 90   },
    };

    const config = PASS_CONFIG[passType];
    if (!config)
      return res.status(400).json({ error: "Invalid pass type." });

    const code = "YOGA-" + Math.random().toString(36).slice(2, 6).toUpperCase();

    let expiresAt = null;
    if (config.expiryDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.expiryDays);
    }

    const pass = await Pass.create({
      code,
      type:           passType,
      studentEmail:   email.toLowerCase().trim(),
      classesTotal:   config.classesTotal,
      classesUsed:    0,
      expiresAt,
      active:         true,
      stripePaymentId,
    });

    // Send confirmation email with pass code
    const { sendPassPurchaseEmail } = require("../email");
    await sendPassPurchaseEmail({ name, email, pass });

    res.status(201).json({
      success: true,
      pass: {
        code:             pass.code,
        type:             pass.type,
        classesTotal:     pass.classesTotal,
        classesRemaining: pass.classesRemaining,
        expiresAt:        pass.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
