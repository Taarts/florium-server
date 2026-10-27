// Sales terminal (admin → Sales & Merch → Sell). Owners and teachers can sell; each sale records who sold it.
//   GET  /api/sales/catalog              what can be sold, with cash and card prices
//   GET  /api/sales/students?q=          find a student by name or email
//   POST /api/sales/checkout             { location, student:{name,email}, items:[{kind,id,quantity}], paymentMethod, note, returnUrl }
//                                          cash / comp → paid now · card → clientSecret for the card form
//                                          phone → Stripe Checkout link + QR code for the student's phone
//   POST /api/sales/orders/:id/complete  { paymentIntentId } after the card form succeeds
//   GET  /api/sales/orders/:id           status (the phone screen polls this)
//   POST /api/sales/orders/:id/cancel    give up on an unpaid card / phone sale
//   POST /api/sales/orders/:id/receipt   email the receipt again
//   GET  /api/sales/orders?from&to       paid sales (owners: everyone's; teachers: their own)
const express = require("express");
const router  = express.Router();
const stripe  = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { requireAuth } = require("../middleware/auth");
const Order   = require("../models/Order");
const Pass    = require("../models/Pass");
const MEMBERSHIP_CONFIG = require("../config/memberships");
const { STUDIO_ID, SITE_URL } = require("../config/studio");
const pos = require("../services/posOrders");

const staff = requireAuth("owner", "teacher");
const isOwner = req => req.user?.role === "owner";
const bad = (res, error, code = 400) => res.status(code).json({ error });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function view(o) {
  const x = o.toObject ? o.toObject() : o;
  return {
    id: String(x._id), receiptNo: x.receiptNo, location: x.location, date: x.date,
    student: x.student, items: x.items, subtotal: x.subtotal, tax: x.tax, total: x.total,
    paymentMethod: x.paymentMethod, status: x.status, note: x.note, soldBy: x.soldBy,
    paidAt: x.paidAt, createdAt: x.createdAt,
    receiptSentAt: x.receiptSentAt, receiptError: x.receiptError,
  };
}

async function loadOwnOrder(req, res) {
  const order = await Order.findById(req.params.id).catch(() => null);
  if (!order) { bad(res, "Sale not found", 404); return null; }
  if (!isOwner(req) && order.soldBy?.userId !== req.user.id) { bad(res, "Forbidden", 403); return null; }
  return order;
}

async function stripeCustomer(email, name) {
  if (!email) return null;
  const found = await stripe.customers.list({ email, limit: 1 });
  return found.data[0] ?? await stripe.customers.create({ email, ...(name ? { name } : {}) });
}

function safeReturnUrl(u) {
  const ok = typeof u === "string" && /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w\-./]*)?$/i.test(u);
  return ok ? u.replace(/\/+$/, "") : (SITE_URL || "https://iy-sp.com").replace(/\/+$/, "");
}

// A sale still pending: ask Stripe whether it has been paid (the webhook may not have landed,
// or the browser lost its connection after the card went through).
async function syncCheckout(order) {
  if (order.status !== "pending") return order;
  try {
    if (!order.stripeCheckoutSessionId) {
      if (order.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.retrieve(order.stripeSubscriptionId, { expand: ["latest_invoice"] });
        if (sub.latest_invoice?.status === "paid" || ["active", "trialing"].includes(sub.status)) return await pos.fulfill(order._id);
      } else if (order.stripePaymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        if (pi.status === "succeeded" && pi.amount === Math.round(order.total * 100)) return await pos.fulfill(order._id);
      }
      return order;
    }
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (session.status === "complete" && session.payment_status === "paid") {
      if (session.mode === "subscription") {
        return await pos.fulfill(order._id, { stripeSubscriptionId: session.subscription });
      }
      if (session.amount_total === Math.round(order.total * 100)) {
        return await pos.fulfill(order._id, { stripePaymentIntentId: session.payment_intent });
      }
    } else if (session.status === "expired") {
      order.status = "cancelled";
      await order.save();
    }
  } catch (err) {
    console.error("✗ POS checkout sync:", err.message);
  }
  return order;
}

// ── GET /catalog ────────────────────────────────────────────
router.get("/catalog", staff, async (req, res, next) => {
  try { res.json(await pos.catalog()); } catch (err) { next(err); }
});

// ── GET /students?q= ────────────────────────────────────────
router.get("/students", staff, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ students: [] });
    const Student = require("../models/Student");
    const re = new RegExp(escRe(q), "i");
    const students = await Student.find({ $or: [{ name: re }, { email: re }] })
      .select("name email").sort({ name: 1 }).limit(8).lean();
    const emails = students.map(st => st.email);
    const passes = await Pass.find({ studentEmail: { $in: emails }, active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .select("studentEmail type classesTotal classesUsed").lean();
    res.json({
      students: students.map(st => {
        const p = passes.filter(x => x.studentEmail === st.email)
          .map(x => ({ type: x.type, left: x.classesTotal === null ? null : x.classesTotal - x.classesUsed }))
          .filter(x => x.left === null || x.left > 0);
        return { name: st.name, email: st.email, passes: p };
      }),
    });
  } catch (err) { next(err); }
});

// ── POST /checkout ──────────────────────────────────────────
router.post("/checkout", staff, async (req, res, next) => {
  try {
    const b = req.body || {};
    const paymentMethod = b.paymentMethod;
    const student = { name: String(b.student?.name || "").trim(), email: String(b.student?.email || "").trim().toLowerCase() };
    if (student.email && !EMAIL_RE.test(student.email)) return bad(res, "That email doesn't look right.");
    if (paymentMethod === "comp" && !isOwner(req)) return bad(res, "Only an owner can give something away free.", 403);

    let priced;
    try { priced = await pos.priceItems(b.items, paymentMethod); }
    catch (e) { return bad(res, e.message, e.status || 400); }

    const needsStudent = priced.items.some(i => i.kind !== "merch");
    if (needsStudent && (!student.email || student.name.length < 2))
      return bad(res, "Passes and memberships need the student's name and email.");
    if ((paymentMethod === "card" || paymentMethod === "phone") && priced.totalCents < 50)
      return bad(res, "Card payments must be at least $0.50.");

    const membership = priced.items.find(i => i.kind === "membership");
    if (membership) {
      const active = await Pass.findOne({ studentEmail: student.email, type: membership.ref, active: true });
      if (active) return bad(res, `${student.name} already has an active ${membership.name.replace(/ \(first month\)$/, "")}.`, 409);
    }

    const order = await pos.createOrder({ priced, student, paymentMethod, location: b.location, note: b.note, user: req.user });
    const meta = { type: "pos_order", orderId: String(order._id), receiptNo: order.receiptNo, studio: STUDIO_ID, soldBy: order.soldBy.name };

    try {
      // Cash and comp: done now.
      if (paymentMethod === "cash" || paymentMethod === "comp") {
        const done = await pos.fulfill(order._id);
        return res.status(201).json({ order: view(done) });
      }

      // Card typed into the form on the admin screen.
      if (paymentMethod === "card") {
        const customer = await stripeCustomer(student.email, student.name);
        if (membership) {
          const sub = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: process.env[MEMBERSHIP_CONFIG[membership.ref].priceEnv] }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.confirmation_secret", "latest_invoice.payment_intent"],
            metadata: { ...meta, passType: membership.ref, studentName: student.name, studentEmail: student.email },
          });
          const inv = sub.latest_invoice;
          const clientSecret = inv?.confirmation_secret?.client_secret ?? inv?.payment_intent?.client_secret;
          if (!clientSecret) throw new Error("Stripe didn't return a payment for the membership.");
          order.stripeSubscriptionId = sub.id;
          await order.save();
          return res.status(201).json({ order: view(order), clientSecret });
        }
        const intent = await stripe.paymentIntents.create({
          amount: priced.totalCents, currency: "usd",
          ...(customer ? { customer: customer.id } : {}),
          payment_method_types: ["card"],
          description: `In-person sale ${order.receiptNo}`,
          metadata: meta,
        });
        order.stripePaymentIntentId = intent.id;
        await order.save();
        return res.status(201).json({ order: view(order), clientSecret: intent.client_secret });
      }

      // Student pays on their own phone: Stripe Checkout link shown as a QR code.
      const returnUrl = safeReturnUrl(b.returnUrl);
      const common = {
        metadata: meta,
        success_url: `${returnUrl}/?paid=1`,
        cancel_url: returnUrl,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        ...(student.email ? { customer_email: student.email } : {}),
      };
      let session;
      if (membership) {
        session = await stripe.checkout.sessions.create({
          ...common, mode: "subscription",
          line_items: [{ price: process.env[MEMBERSHIP_CONFIG[membership.ref].priceEnv], quantity: 1 }],
          subscription_data: { metadata: { ...meta, passType: membership.ref, studentName: student.name, studentEmail: student.email } },
        });
      } else {
        const line_items = priced.items.map(i => ({
          quantity: i.quantity,
          price_data: { currency: "usd", unit_amount: Math.round(i.unitPrice * 100), product_data: { name: i.name } },
        }));
        if (priced.tax > 0) line_items.push({
          quantity: 1,
          price_data: { currency: "usd", unit_amount: Math.round(priced.tax * 100), product_data: { name: "Sales tax" } },
        });
        session = await stripe.checkout.sessions.create({
          ...common, mode: "payment", line_items,
          payment_intent_data: { description: `In-person sale ${order.receiptNo}`, metadata: meta },
        });
      }
      order.stripeCheckoutSessionId = session.id;
      order.checkoutUrl = session.url;
      await order.save();
      // The QR holds a short link to this server (/api/sales/pay/:id), which forwards to Stripe:
      // Stripe's own URL is too long for a QR code phones read reliably.
      const shortUrl = `${req.protocol}://${req.get("host")}/api/sales/pay/${order._id}`;
      const qr = await require("qrcode").toDataURL(shortUrl, { margin: 2, width: 360, errorCorrectionLevel: "M" });
      return res.status(201).json({ order: view(order), checkoutUrl: shortUrl, qr });
    } catch (err) {
      order.status = "cancelled";
      order.note = `${order.note ? order.note + " · " : ""}Setup failed: ${err.message}`.slice(0, 500);
      await order.save().catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("✗ POS checkout:", err.message);
    if (err.type && String(err.type).startsWith("Stripe")) return bad(res, err.message);
    next(err);
  }
});

// ── GET /pay/:id (public) ───────────────────────────────────
// Where the QR code points: forwards the student's phone to the Stripe payment page.
router.get("/pay/:id", async (req, res) => {
  const page = msg => res.status(200).type("html").send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;padding:2rem;text-align:center;color:#333"><p>${msg}</p></body>`);
  try {
    const order = await Order.findById(req.params.id).catch(() => null);
    if (!order) return page("This payment link isn't valid.");
    if (order.status === "paid") return page("This sale is already paid. Thank you!");
    if (order.status !== "pending" || !order.checkoutUrl) return page("This payment link has expired. Please ask for a new one.");
    return res.redirect(302, order.checkoutUrl);
  } catch {
    return page("Something went wrong. Please ask for a new link.");
  }
});

// ── POST /orders/:id/complete ───────────────────────────────
router.post("/orders/:id/complete", staff, async (req, res, next) => {
  try {
    const order = await loadOwnOrder(req, res);
    if (!order) return;
    if (order.status === "paid") return res.json({ order: view(order) });
    if (order.status !== "pending") return bad(res, "This sale was cancelled.");

    if (order.stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(order.stripeSubscriptionId, { expand: ["latest_invoice"] });
      const paid = sub.latest_invoice?.status === "paid" || ["active", "trialing"].includes(sub.status);
      if (!paid) return bad(res, "The card payment hasn't gone through yet.");
      const done = await pos.fulfill(order._id);
      return res.json({ order: view(done) });
    }

    const piId = String(req.body?.paymentIntentId || order.stripePaymentIntentId || "");
    if (!piId) return bad(res, "Missing payment.");
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status !== "succeeded") return bad(res, "The card payment hasn't gone through yet.");
    if (pi.metadata?.orderId !== String(order._id) || pi.amount !== Math.round(order.total * 100) || pi.currency !== "usd")
      return bad(res, "That payment doesn't match this sale.");
    const done = await pos.fulfill(order._id, { stripePaymentIntentId: pi.id });
    res.json({ order: view(done) });
  } catch (err) { next(err); }
});

// ── GET /orders/:id ─────────────────────────────────────────
router.get("/orders/:id", staff, async (req, res, next) => {
  try {
    let order = await loadOwnOrder(req, res);
    if (!order) return;
    order = await syncCheckout(order);
    res.json({ order: view(order) });
  } catch (err) { next(err); }
});

// ── POST /orders/:id/cancel ─────────────────────────────────
router.post("/orders/:id/cancel", staff, async (req, res, next) => {
  try {
    let order = await loadOwnOrder(req, res);
    if (!order) return;
    order = await syncCheckout(order);   // paid in the meantime? then it stays paid
    if (order.status !== "pending") return res.json({ order: view(order) });
    try {
      if (order.stripeCheckoutSessionId) await stripe.checkout.sessions.expire(order.stripeCheckoutSessionId);
      else if (order.stripeSubscriptionId) await stripe.subscriptions.cancel(order.stripeSubscriptionId);
      else if (order.stripePaymentIntentId) await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
    } catch (err) {
      console.warn("· POS cancel (Stripe):", err.message);
    }
    order.status = "cancelled";
    await order.save();
    res.json({ order: view(order) });
  } catch (err) { next(err); }
});

// ── POST /orders/:id/receipt ────────────────────────────────
router.post("/orders/:id/receipt", staff, async (req, res, next) => {
  try {
    const order = await loadOwnOrder(req, res);
    if (!order) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(email)) return bad(res, "That email doesn't look right.");
      order.student.email = email;
      await order.save();
    }
    const r = await pos.sendReceipt(order._id, { force: true });
    if (!r.sent) return bad(res, r.error || "Couldn't send the receipt (is there an email on the sale?)");
    res.json({ order: view(await Order.findById(order._id)) });
  } catch (err) { next(err); }
});

// ── GET /orders?from&to ─────────────────────────────────────
router.get("/orders", staff, async (req, res, next) => {
  try {
    const from = String(req.query.from || pos.todayStr());
    const to   = String(req.query.to   || from);
    const filter = { status: "paid", date: { $gte: from, $lte: to } };
    if (!isOwner(req)) filter["soldBy.userId"] = req.user.id;
    const orders = await Order.find(filter).sort({ paidAt: -1 }).limit(500);
    res.json({ orders: orders.map(view) });
  } catch (err) { next(err); }
});

module.exports = router;
