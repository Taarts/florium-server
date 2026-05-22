const express   = require("express");
const router    = express.Router();
const Pass      = require("../models/Pass");
const adminAuth = require("../middleware/auth");

const EXPIRY_DAYS = {
  pass4: 60,
  pass8: 90,
};

const MEMBERSHIP_CONFIG = {
  member2x: {
    label:        "Member 2x/week",
    classesTotal: 9,
    priceEnvVar:  "STRIPE_PRICE_MEMBER_2X",
  },
  memberUnl: {
    label:        "Member Unlimited",
    classesTotal: null,
    priceEnvVar:  "STRIPE_PRICE_MEMBER_UNL",
  },
};

// Lazy Stripe factory — avoids module-level init before dotenv loads
function getStripe() {
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// ── POST /api/passes/verify ────────────────────────────────
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
    if (!valid) return res.status(200).json({ valid: false, reason });

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
router.post("/redeem", async (req, res, next) => {
  try {
    const { passId } = req.body;
    if (!passId)
      return res.status(400).json({ error: "passId is required." });

    const pass = await Pass.findById(passId);
    if (!pass)
      return res.status(404).json({ error: "Pass not found." });

    const { valid, reason } = pass.isValid();
    if (!valid) return res.status(400).json({ valid: false, reason });

    pass.classesUsed += 1;
    if (pass.classesTotal !== null && pass.classesUsed >= pass.classesTotal) {
      pass.active = false;
    }
    await pass.save();

    res.json({ success: true, classesRemaining: pass.classesRemaining });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/passes/subscribe ────────────────────────────
// Student starts a membership subscription via Stripe.
// Returns a clientSecret for the frontend to confirm the card payment.
router.post("/subscribe", async (req, res, next) => {
  try {
    const { name, email, passType } = req.body;
    if (!name || !email || !passType)
      return res.status(400).json({ error: "Missing required fields." });

    const config = MEMBERSHIP_CONFIG[passType];
    if (!config)
      return res.status(400).json({ error: "Invalid membership type." });

    const priceId = process.env[config.priceEnvVar];
    if (!priceId)
      return res.status(500).json({ error: `Stripe price not configured for ${passType}.` });

    const stripe = getStripe();

    // Create or retrieve Stripe customer
    const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
    const customer = customers.data.length
      ? customers.data[0]
      : await stripe.customers.create({ name, email: email.toLowerCase() });

    // Create subscription — expand latest_invoice so we get the clientSecret
    const subscription = await stripe.subscriptions.create({
      customer:         customer.id,
      items:            [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand:           ["latest_invoice.payment_intent"],
    });

    const invoice = await stripe.invoices.retrieve(subscription.latest_invoice.id);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: invoice.amount_due,
      currency: invoice.currency,
      customer: customer.id,
      metadata: { subscriptionId: subscription.id, invoiceId: invoice.id, passType, studentName: name, studentEmail: email },
    });
    if (!paymentIntent || !paymentIntent.client_secret) {
      return res.status(500).json({ error: "Failed to create payment intent." });
    }

    res.json({
      clientSecret:   paymentIntent.client_secret,
      subscriptionId: subscription.id,
      customerId:     customer.id,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/passes/portal ────────────────────────────────
// Returns a Stripe Customer Portal URL for the student to manage
// their membership (cancel, update payment method, etc.)
router.get("/portal", async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email)
      return res.status(400).json({ error: "Email is required." });

    const pass = await Pass.findOne({
      studentEmail: email.toLowerCase().trim(),
      active:       true,
      type:         { $in: ["member2x", "memberUnl"] },
    }).sort({ createdAt: -1 });

    if (!pass || !pass.stripeCustomerId)
      return res.status(404).json({ error: "No active membership found." });

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer:   pass.stripeCustomerId,
      return_url: `${process.env.CLIENT_ORIGIN}/my-bookings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/passes/active ────────────────────────────────
router.get("/active", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const pass = await Pass.findOne({
      studentEmail: email.toLowerCase().trim(),
      active:       true,
      type:         { $nin: ["dropin"] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    }).sort({ createdAt: -1 });

    if (!pass) return res.json({ pass: null });

    res.json({
      pass: {
        id:               pass._id,
        code:             pass.code,
        type:             pass.type,
        classesRemaining: pass.classesTotal - pass.classesUsed,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/passes (admin only) ─────────────────────────
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const body = req.body;
    const { type, studentEmail, classesTotal, notes } = body;

    // Generate a readable code e.g. "FLO-A3F2"
    const code = "FLO-" + Math.random().toString(36).slice(2, 6).toUpperCase();

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
    });

    res.status(201).json({ pass });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/passes (admin only) ──────────────────────────
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

    const code = "FLO-" + Math.random().toString(36).slice(2, 6).toUpperCase();

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