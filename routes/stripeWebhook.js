const express = require("express");
const router  = express.Router();
const Pass    = require("../models/Pass");
const MembershipRenewal = require("../models/MembershipRenewal");
const stripe  = require("stripe")(process.env.STRIPE_SECRET_KEY);

const MEMBERSHIP_CONFIG = require("../config/memberships");
const {
  sendMembershipPurchaseEmail,
  sendMembershipRenewalEmail,
  sendMembershipCancelledEmail,
  sendPassPurchaseEmail,
} = require("../email");

// IMPORTANT: this router must be mounted BEFORE express.json() in index.js,
// because Stripe signature verification needs the raw request body.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig    = req.headers["stripe-signature"];
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
        case "checkout.session.completed":
          await handleCheckoutSessionCompleted(event.data.object);
          break;
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

// ─── checkout.session.completed ────────────────────────────
// Fires when a Payment Link purchase completes (private passes).
async function handleCheckoutSessionCompleted(session) {
  if (session.metadata?.type === "pos_order") return handlePosCheckout(session);
  if (session.mode !== "payment") return;

  if (session.metadata?.type === "video_rental") {
    return handleVideoRentalCompleted(session);
  }

  // Shared Stripe account: ignore events tagged for another studio.
  // (No tag = legacy iy-sp payment link — process it.)
  if (session.metadata?.studio && session.metadata.studio !== require("../config/studio").STUDIO_ID) {
    console.log(`· checkout.session for studio "${session.metadata.studio}" — not ours, ignoring`);
    return;
  }

  const passType = session.metadata?.passType;
  if (!passType) {
    console.warn("✗ checkout.session.completed: no passType in metadata, ignoring");
    return;
  }

  const PRIVATE_PASS_CONFIG = {
    private1:  { classesTotal: 1,  expiryDays: null },
    private3:  { classesTotal: 3,  expiryDays: null },
    private10: { classesTotal: 10, expiryDays: null },
  };

  const config = PRIVATE_PASS_CONFIG[passType];
  if (!config) {
    console.warn(`✗ checkout.session.completed: unknown passType "${passType}"`);
    return;
  }

  const studentEmail = (session.customer_details?.email || "").toLowerCase().trim();
  const studentName  = session.customer_details?.name || "";

  if (!studentEmail) {
    console.warn("✗ checkout.session.completed: no customer email on session");
    return;
  }

  const existing = await Pass.findOne({ stripeSessionId: session.id });
  if (existing) {
    console.log(`· checkout already processed for session ${session.id} (${existing.code})`);
    return;
  }

  const code = "PRIV-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const pass = await Pass.create({
    code,
    type:            passType,
    studentEmail,
    classesTotal:    config.classesTotal,
    classesUsed:     0,
    expiresAt:       null,
    active:          true,
    stripeSessionId: session.id,
  });

  await sendPassPurchaseEmail({ name: studentName, email: studentEmail, pass });
  console.log(`✓ Private pass created: ${pass.code} (${passType}) for ${studentEmail}`);
}

// ─── sales terminal: student paid on their phone ─────────────
async function handlePosCheckout(session) {
  if (session.metadata.studio && session.metadata.studio !== require("../config/studio").STUDIO_ID) return;
  if (session.payment_status !== "paid") return;
  const Order = require("../models/Order");
  const pos   = require("../services/posOrders");
  const order = await Order.findById(session.metadata.orderId).catch(() => null);
  if (!order) { console.warn(`✗ POS checkout: order ${session.metadata.orderId} not found`); return; }
  if (session.mode === "subscription") {
    await pos.fulfill(order._id, { stripeSubscriptionId: session.subscription });
    return;
  }
  if (session.amount_total !== Math.round(order.total * 100)) {
    console.error(`✗ POS checkout ${order.receiptNo}: paid ${session.amount_total}c, expected ${Math.round(order.total * 100)}c`);
    return;
  }
  await pos.fulfill(order._id, { stripePaymentIntentId: session.payment_intent });
}

// ─── video_rental checkout ──────────────────────────────────
async function handleVideoRentalCompleted(session) {
  const Rental = require("../models/Rental");
  const Video = require("../models/Video");
  const bunnyService = require("../services/bunnyService");
  const { sendVideoLinkEmail } = require("../email");

  const { videoId, studentEmail } = session.metadata || {};
  if (!videoId || !studentEmail) {
    console.warn("✗ video_rental checkout: missing videoId or studentEmail in metadata");
    return;
  }

  const paymentIntentId = session.payment_intent;
  if (!paymentIntentId) {
    console.warn("✗ video_rental checkout: no payment_intent on session");
    return;
  }

  const existing = await Rental.findOne({ stripePaymentIntentId: paymentIntentId });
  if (existing) {
    console.log(`· video rental already processed for payment intent ${paymentIntentId}`);
    return;
  }

  const video = await Video.findById(videoId);
  if (!video) {
    console.warn(`✗ video_rental checkout: video ${videoId} not found`);
    return;
  }

  const cleanEmail = studentEmail.toLowerCase().trim();
  const RENTAL_WINDOW_HOURS = 48;
  const expiresAt = new Date(Date.now() + RENTAL_WINDOW_HOURS * 60 * 60 * 1000);

  await Rental.create({
    video: videoId,
    studentEmail: cleanEmail,
    stripePaymentIntentId: paymentIntentId,
    amount: session.amount_total,
    expiresAt,
    couponCode: session.metadata?.couponCode || null,
  });

  if (session.metadata?.couponCode) {
    const Coupon = require("../models/Coupon");
    await Coupon.findOneAndUpdate(
      { code: session.metadata.couponCode },
      { $inc: { usedCount: 1 } }
    );
    console.log(`✓ Coupon ${session.metadata.couponCode} redeemed on video rental`);
  }

  const playbackUrl = bunnyService.getPlaybackUrl(video.bunnyVideoId);
  await sendVideoLinkEmail(cleanEmail, video.title, playbackUrl);

  console.log(`✓ Video rental created + email sent for ${cleanEmail} — video ${videoId}, expires ${expiresAt.toISOString()}`);
}

// ─── invoice.payment_succeeded ─────────────────────────────
async function handleInvoicePaymentSucceeded(invoice) {
  // Stripe API 2025-03-31.basil+ moved invoice.subscription to invoice.parent.subscription_details
  const subRef =
    invoice.subscription ??
    invoice.parent?.subscription_details?.subscription ??
    invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subscriptionId) {
    console.log(`· invoice ${invoice.id}: no subscription on invoice — ignoring`);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const meta = subscription.metadata || {};

  // Shared Stripe account: ignore subscriptions tagged for another studio.
  // (No tag = legacy iy-sp subscription — process it.)
  if (meta.studio && meta.studio !== require("../config/studio").STUDIO_ID) {
    console.log(`· invoice for studio "${meta.studio}" subscription — not ours, ignoring`);
    return;
  }

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
    const code = "YOGA-" + Math.random().toString(36).slice(2, 6).toUpperCase();
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

    await MembershipRenewal.findOneAndUpdate(
      { stripeInvoiceId: invoice.id },
      {
        passId: pass._id,
        passCode: pass.code,
        type: passType,
        studentEmail,
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: invoice.id,
        amountPaid: invoice.amount_paid / 100,
        periodEnd,
        paidAt: new Date(invoice.status_transitions?.paid_at ? invoice.status_transitions.paid_at * 1000 : Date.now()),
        isInitial: true,
      },
      { upsert: true, new: true }
    );

    await sendMembershipPurchaseEmail({ name: studentName, email: studentEmail, pass });
    console.log(`✓ Membership pass created: ${pass.code} (${passType}) for ${studentEmail}`);
    if (meta.type === "pos_order" && meta.orderId) {
      const pos = require("../services/posOrders");
      await pos.fulfill(meta.orderId).catch(e => console.error("✗ POS membership fulfil:", e.message));
      await pos.attachMembershipPass(meta.orderId, pass).catch(e => console.error("✗ POS membership code:", e.message));
    }
    return;
  }

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

  await MembershipRenewal.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    {
      passId: pass._id,
      passCode: pass.code,
      type: passType,
      studentEmail,
      stripeSubscriptionId: subscriptionId,
      stripeInvoiceId: invoice.id,
      amountPaid: invoice.amount_paid / 100,
      periodEnd,
      paidAt: new Date(invoice.status_transitions?.paid_at ? invoice.status_transitions.paid_at * 1000 : Date.now()),
      isInitial: false,
    },
    { upsert: true, new: true }
  );

  await sendMembershipRenewalEmail({ name: studentName, email: studentEmail, pass });
  console.log(`✓ Membership renewed: ${pass.code} (${passType}) — period ends ${periodEnd.toISOString()}`);
}

// ─── customer.subscription.deleted ─────────────────────────
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