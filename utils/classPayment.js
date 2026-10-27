// Server-side check for class drop-in payments. The browser picks the amount it sends
// to /api/payments/intent, so a booking is only accepted once we've confirmed with Stripe
// that the payment succeeded, is recent, hasn't been used before, and covers this class:
//   · regular class  → the class price, less a valid coupon (never below Stripe's 50¢ minimum)
//   · sliding scale  → at least the class's lowest price
const Booking = require("../models/Booking");
const Coupon  = require("../models/Coupon");
const Pass    = require("../models/Pass");

const MAX_AGE_SEC = 3600;
const fail = (status, error) => ({ ok: false, status, error });

// Returns { coupon } if the code is valid for this purchase by this email, or { error }.
// appliesTo: "dropin" for class bookings, or the pass type being bought (pass4, pass8, …).
async function checkCoupon(code, email, appliesTo = "dropin") {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
  if (!coupon || !coupon.active)                              return { error: "That code isn't valid." };
  if (coupon.expiresAt && new Date() > coupon.expiresAt)      return { error: "That code has expired." };
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { error: "That code has reached its usage limit." };
  if (coupon.appliesToTypes.length && !coupon.appliesToTypes.includes(appliesTo))
    return { error: appliesTo === "dropin" ? "That code doesn't apply to class bookings." : "That code doesn't apply to this purchase." };
  if (coupon.allowedEmails.length && !coupon.allowedEmails.includes(email))
    return { error: "That code isn't available for this email address." };
  const memberships = coupon.allowedMemberships.length
    ? coupon.allowedMemberships
    : coupon.membersOnly ? ["member2x", "memberUnl"] : [];
  if (memberships.length) {
    const member = await Pass.exists({ studentEmail: email, type: { $in: memberships }, active: true });
    if (!member) return { error: "That code is for members only." };
  }
  return { coupon };
}

async function verifyDropinPayment({ cls, email, stripePaymentId, couponCode }) {
  const sliding = cls.priceMin != null && cls.priceMax != null;
  let coupon = null;
  let requiredCents;

  if (sliding) {
    if (couponCode) return fail(400, "Codes can't be used on pay-what-you-can classes.");
    requiredCents = Math.round(Number(cls.priceMin) * 100);
  } else {
    const baseCents = Math.round((Number(cls.price) || 0) * 100);
    requiredCents = baseCents;
    if (couponCode && baseCents > 0) {
      const c = await checkCoupon(couponCode, email);
      if (c.error) return fail(400, c.error);
      coupon = c.coupon;
      const off = coupon.type === "percent"
        ? baseCents * (coupon.amount / 100)
        : Math.round(coupon.amount * 100);
      requiredCents = Math.max(50, Math.round(baseCents - off)); // same floor the booking form uses
    }
  }

  if (requiredCents <= 0 && !stripePaymentId) return { ok: true, coupon, amountCents: 0 };

  if (!stripePaymentId || typeof stripePaymentId !== "string")
    return fail(402, "Payment is required for this booking.");
  if (await Booking.exists({ stripePaymentId }))
    return fail(409, "This payment has already been used for a booking.");

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  let pi;
  try { pi = await stripe.paymentIntents.retrieve(stripePaymentId); }
  catch { return fail(402, "Payment could not be verified."); }

  const ageSec   = Math.floor(Date.now() / 1000) - (pi.created || 0);
  const received = pi.amount_received || 0;
  if (pi.status !== "succeeded" || pi.currency !== "usd" || received < requiredCents || ageSec > MAX_AGE_SEC) {
    console.warn(`✗ class ${cls.id}: payment ${stripePaymentId} status=${pi.status} received=${received} required=${requiredCents} age=${ageSec}s email=${email}`);
    return fail(402, "Payment doesn't cover this booking.");
  }
  return { ok: true, coupon, amountCents: received };
}

module.exports = { verifyDropinPayment, checkCoupon };
