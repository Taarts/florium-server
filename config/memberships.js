// Shared membership config — used by routes/passes.js (subscribe route)
// and routes/stripeWebhook.js (invoice.payment_succeeded handler).
//
// classesTotal=null = unlimited. The webhook resets classesUsed=0 every renewal.
// priceEnv names the env var that holds the Stripe Price ID for that tier.
module.exports = {
  member2x:  { classesTotal: 9,    priceEnv: "STRIPE_PRICE_MEMBER_2X"  }, // 2/wk + 1 buffer
  memberUnl: { classesTotal: null, priceEnv: "STRIPE_PRICE_MEMBER_UNL" }, // unlimited
  videoSub:  { classesTotal: null, priceEnv: "STRIPE_PRICE_VIDEO_SUB" }, // $99/mo unlimited video
};
