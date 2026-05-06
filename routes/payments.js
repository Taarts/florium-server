const express = require("express");
const router  = express.Router();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// POST /api/payments/intent  — updated to accept amount
router.post("/intent", async (req, res) => {
  const { email, amount } = req.body;              // amount in cents
  if (!amount || amount < 50) return res.status(400).json({ error: "Invalid amount" });

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0] ?? await stripe.customers.create({ email });

    const intent = await stripe.paymentIntents.create({
      amount,                                       // variable now
      currency: "usd",
      customer: customer.id,
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});
module.exports = router;