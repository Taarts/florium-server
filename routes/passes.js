const express   = require("express");
const router    = express.Router();
const Pass      = require("../models/Pass");
const adminAuth = require("../middleware/auth");
const stripe    = require("stripe")(process.env.STRIPE_SECRET_KEY);
const MEMBERSHIP_CONFIG = require("../config/memberships");

const EXPIRY_DAYS = {
  pass4: 60,
  pass8: 90,
};

// ── GET /api/passes/catalog ────────────────────────────────
// Public: this deployment's pass + membership prices (config/pricing.js).
router.get("/catalog", (req, res) => {
  const P = require("../config/pricing");
  const pub = ({ agreementLabel, agreementDescription, ...rest }) => rest;
  res.json({
    passes:      Object.entries(P.passes).map(([id, p]) => ({ id, ...p })),
    memberships: Object.entries(P.memberships).map(([id, m]) => ({ id, ...pub(m) })),
  });
});

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

// POST /api/passes/redeem removed 10-17: it was public and took a class off any pass by id.
// Bookings consume passes themselves (Pass.consume).

// ── POST /api/passes (admin only) ─────────────────────────
// Admin creates a new pass for a student (after payment via
// Acuity or in person). Generates a unique code automatically.
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const body = req.body;
    const { type, studentEmail, classesTotal, notes, amountPaid, couponCode } = req.body;

    // Generate a readable 8-char code e.g. "YOGA-A3F2"
    const isPrivate = ["private1","private3","private10"].includes(type);
    const code = (isPrivate ? "PRIV-" : "YOGA-") + Math.random().toString(36).slice(2, 6).toUpperCase();

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
      expiresAt:    body.expiresAt ?? null,
      notes,
      amountPaid:   amountPaid ?? null,
      purchaseStatus: "admin",
    });

    if (couponCode) {
      const Coupon = require('../models/Coupon');
      await Coupon.findOneAndUpdate(
        { code: couponCode.toUpperCase().trim(), active: true },
        { $inc: { usedCount: 1 } }
      );
    }

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
      type: { $nin: ['dropin', 'private1', 'private3', 'private10'] },
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
        classesTotal: pass.classesTotal,
        classesUsed: pass.classesUsed,
        expiresAt: pass.expiresAt,
        classesRemaining: pass.classesTotal !== null 
         ? pass.classesTotal - pass.classesUsed 
         : null
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
    const allowed = ["classesTotal", "classesUsed", "expiresAt", "active", "notes"];
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
    const { name, email, passType, stripePaymentId, couponCode } = req.body;
    if (!name || !email || !passType || !stripePaymentId)
      return res.status(400).json({ error: "Missing required fields." });

    // Verify payment succeeded with Stripe before creating anything
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentId);
    if (paymentIntent.status !== "succeeded")
      return res.status(400).json({ error: "Payment not confirmed. Please try again." });

    // Verify the paid AMOUNT matches the pass price (with any valid coupon
    // applied). Without this, a 50-cent PaymentIntent could mint any pass.
    // Cents, incl. card-fee gross-up — must match PASS_OPTIONS in the frontend.
    const PASS_STRIPE_AMOUNTS = Object.fromEntries(Object.entries(require("../config/pricing").passes).map(([k, p]) => [k, p.stripeAmount]));
    const baseAmount = PASS_STRIPE_AMOUNTS[passType];
    if (!baseAmount)
      return res.status(400).json({ error: "Invalid pass type." });

    let expectedAmount = baseAmount;
    if (couponCode) {
      // Same rules as class bookings: expiry, uses, what it applies to, and any email / members-only limit
      const { checkCoupon } = require("../utils/classPayment");
      const c = await checkCoupon(couponCode, email.toLowerCase().trim(), passType);
      if (c.error) return res.status(400).json({ error: `${c.error} Your card has been charged — please contact the studio.` });
      const coupon = c.coupon;
      expectedAmount = coupon.type === "percent"
        ? Math.max(50, Math.round(baseAmount * (1 - coupon.amount / 100)))
        : Math.max(50, Math.round(baseAmount - coupon.amount * 100));
    }

    if (paymentIntent.amount !== expectedAmount || paymentIntent.currency !== "usd")
      return res.status(400).json({ error: "Payment amount doesn't match the pass price. Please contact the studio." });

    // Single-use: block replaying one payment into multiple passes
    const alreadyUsed = await Pass.findOne({ stripePaymentId });
    if (alreadyUsed)
      return res.status(409).json({ error: "This payment has already been used for a pass." });

    const PASS_CONFIG = {
      dropin: { classesTotal: 1,    expiryDays: null },
      pass4:  { classesTotal: 4,    expiryDays: 60   },
      pass8:  { classesTotal: 8,    expiryDays: 90   },
    };

    const config = PASS_CONFIG[passType];
    if (!config)
      return res.status(400).json({ error: "Invalid pass type." });

    const isPrivate = ["private1","private3","private10"].includes(passType);
    const code = (isPrivate ? "PRIV-" : "YOGA-") + Math.random().toString(36).slice(2, 6).toUpperCase();

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
      purchaseStatus: "pending",
    });

    const Student = require("../models/Student");
    await Student.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: { name },
        $setOnInsert: { email: email.toLowerCase().trim(), firstVisit: new Date() },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (couponCode) {
      const Coupon = require('../models/Coupon');
      await Coupon.findOneAndUpdate(
        { code: couponCode.toUpperCase().trim(), active: true },
        { $inc: { usedCount: 1 } }
      );
    }

    // Send confirmation email with pass code
    const { sendPassPurchaseEmail } = require("../email");
    await sendPassPurchaseEmail({ name, email, pass });

    pass.purchaseStatus = "complete";
    await pass.save();

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

// ── POST /api/passes/subscribe (public) ───────────────────
// Creates a Stripe Subscription (incomplete until first payment confirms).
// Returns a clientSecret that the frontend uses with stripe.confirmCardPayment.
// On success Stripe fires invoice.payment_succeeded, which our webhook handles
// by creating the Pass record + sending the welcome email.
router.post("/subscribe", async (req, res, next) => {
  try {
    const { name, email, passType } = req.body;
    if (!name || !email || !passType)
      return res.status(400).json({ error: "Missing required fields." });

    const config = MEMBERSHIP_CONFIG[passType];
    if (!config)
      return res.status(400).json({ error: "Invalid membership type." });

    // Idempotency: block if active membership already exists
    const activeMembership = await Pass.findOne({
      studentEmail: email.toLowerCase().trim(),
      type:         passType,
      active:       true,
    });
    if (activeMembership) return res.status(409).json({ error: "Active membership already exists." });

    const priceId = process.env[config.priceEnv];
    if (!priceId)
      return res.status(500).json({ error: "Membership price not configured." });

    const cleanEmail = email.toLowerCase().trim();

    // Find or create the Stripe customer
    const existing = await stripe.customers.list({ email: cleanEmail, limit: 1 });
    const customer = existing.data[0]
      ?? await stripe.customers.create({ email: cleanEmail, name: name.trim() });

    // Create the subscription in "incomplete" state — the frontend confirms
    // payment, then Stripe fires invoice.payment_succeeded.
    //
    // Stripe API note: in newer API versions (Stripe-Node v22+), Invoice no
    // longer exposes `payment_intent` directly — the client_secret lives at
    // `latest_invoice.confirmation_secret.client_secret`. We expand both and
    // fall back so this works across API versions.
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret", "latest_invoice.payment_intent"],
      metadata: { studio: require("../config/studio").STUDIO_ID, passType, studentName: name.trim(), studentEmail: cleanEmail },
    });

    const invoice = subscription.latest_invoice;
    const clientSecret =
      invoice?.confirmation_secret?.client_secret ??
      invoice?.payment_intent?.client_secret;

    if (!clientSecret) {
      console.error("✗ /passes/subscribe: no client_secret on latest_invoice",
        JSON.stringify({ subId: subscription.id, hasConf: !!invoice?.confirmation_secret, hasPI: !!invoice?.payment_intent }));
      return res.status(500).json({ error: "Could not initialize payment. Please contact support." });
    }

    res.json({
      subscriptionId: subscription.id,
      clientSecret,
    });
  } catch (err) {
    console.error("✗ /passes/subscribe failed:", err.message);
    next(err);
  }
});

// ── GET /api/passes/portal?email=... (public) ─────────────
// Returns a Stripe Customer Portal session URL for the member to manage
// their subscription (cancel, update card, view invoices).
router.get("/portal", adminAuth, async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required." });

    const cleanEmail = email.toLowerCase().trim();
    const customers = await stripe.customers.list({ email: cleanEmail, limit: 1 });
    if (!customers.data[0])
      return res.status(404).json({ error: "No member found for that email." });

    const session = await stripe.billingPortal.sessions.create({
      customer:    customers.data[0].id,
      return_url:  `${require("../config/studio").SITE_URL || "https://iy-sp.org"}/my-bookings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("✗ /passes/portal failed:", err.message);
    next(err);
  }
});

module.exports = router;
