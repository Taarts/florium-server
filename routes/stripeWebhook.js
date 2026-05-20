const express = require("express");
const router  = express.Router();
const Pass    = require("../models/Pass");
const stripe  = require("stripe")(process.env.STRIPE_SECRET_KEY);

const MEMBERSHIP_CONFIG = require("../config/memberships");
const {
  sendMembershipPurchaseEmail,
  sendMembershipRenewalEmail,
  sendMembershipCancelledEmail,
} = require("../email");

// IMPORTANT: this router must be mounted BEFORE express.json() in index.js,
// because Stripe signature verification needs the raw request body.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("WEBHOOK HIT", req.method, req.path); const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error("✗ Stripe webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "invoice.payment_succeeded":
          await handleInvoicePaymentSucceeded(event.data.object);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object);
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error("✗ Stripe webhook handler error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

async function handleInvoicePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription ?? invoice.subscription_id ?? invoice.parent?.subscription_details?.subscription; console.log("WEBHOOK invoice.subscription:", invoice.subscription, "keys:", Object.keys(invoice).join(","));
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const meta     = subscription.metadata || {};
  const passType = meta.passType;
  const config   = MEMBERSHIP_CONFIG[passType];
  if (!config) {
    console.warn(`✗ webhook: unknown passType in subscription ${subscriptionId}`);
    return;
  }

  const studentName  = meta.studentName  || "";
  const studentEmail = (meta.studentEmail || invoice.customer_email || "").toLowerCase().trim();

  const rawPeriodEnd =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end;

  if (!rawPeriodEnd) {
    console.error(`✗ webhook: no current_period_end on subscription ${subscriptionId}`);
    throw new Error("subscription is missing current_period_end");
  }
  const periodEnd = new Date(rawPeriodEnd * 1000);

  let pass = await Pass.findOne({ stripeSubscriptionId: subscriptionId });

  if (!pass) {
    const code = "FLO-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    pass = await Pass.create({
      code,
      type:                 passType,
      studentEmail,
      classesTotal:         config.classesTotal,
      classesUsed:          0,
      expiresAt:            periodEnd,
      active:               true,
      stripeCustomerId:     subscription.customer,
      stripeSubscriptionId: subscriptionId,
      currentPeriodEnd:     periodEnd,
    });

    await sendMembershipPurchaseEmail({ name: studentName, email: studentEmail, pass });
    console.log(`✓ Membership pass created: ${pass.code} (${passType}) for ${studentEmail}`);
    return;
  }

  // Renewal — idempotency check
  if (pass.currentPeriodEnd && pass.currentPeriodEnd.getTime() === periodEnd.getTime()) {
    console.log(`· Renewal already processed for ${pass.code} (${periodEnd.toISOString()})`);
    return;
  }

  pass.classesTotal     = config.classesTotal;
  pass.classesUsed      = 0;
  pass.expiresAt        = periodEnd;
  pass.currentPeriodEnd = periodEnd;
  pass.active           = true;
  await pass.save();

  await sendMembershipRenewalEmail({ name: studentName, email: studentEmail, pass });
  console.log(`✓ Membership renewed: ${pass.code} (${passType}) — period ends ${periodEnd.toISOString()}`);
}

async function handleSubscriptionDeleted(subscription) {
  const pass = await Pass.findOne({ stripeSubscriptionId: subscription.id });
  if (!pass) return;

  pass.active = false;
  await pass.save();

  const meta = subscription.metadata || {};
  const studentName  = meta.studentName  || "";
  const studentEmail = (meta.studentEmail || pass.studentEmail || "").toLowerCase().trim();

  await sendMembershipCancelledEmail({ name: studentName, email: studentEmail, pass });
  console.log(`✓ Membership cancelled: ${pass.code} (${pass.type}) for ${studentEmail}`);
}

module.exports = router;
