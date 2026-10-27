// Sales terminal: pricing, fulfilment and receipts for in-person sales (models/Order.js).
// Used by routes/sales.js and routes/stripeWebhook.js.
//
// Prices are always worked out here on the server from the catalog, never taken from the browser.
//   merch        product price; sales tax (TAX_RATE) on products marked taxable — merch only
//   passes       cash/comp: advertised price · card/phone: the online card price (stripeAmount)
//   memberships  card/phone only, first month at the Stripe Price amount (actualCharge)
const Order   = require("../models/Order");
const Product = require("../models/Product");
const Sale    = require("../models/Sale");
const Pass    = require("../models/Pass");
const PRICING = require("../config/pricing");
const MEMBERSHIP_CONFIG = require("../config/memberships");
const brevoClient = require("../lib/brevoClient");
const s = require("../emails/emailStyles");

const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? 0.07); // Florida 6% + Pinellas 1%
const TZ = process.env.STUDIO_TZ || "America/New_York";

const PASS_RULES = {
  dropin: { expiryDays: null },
  pass4:  { expiryDays: 60 },
  pass8:  { expiryDays: 90 },
};

// Name, reply-to and website used on the receipt, by the site it was sold on.
const LOCATIONS = {
  "iy-sp":  { name: "Iyengar Yoga St. Petersburg", replyTo: process.env.REPLY_TO || "info@iy-sp.com", site: "https://iy-sp.com" },
  flourish: { name: "Flourish Yoga", replyTo: "info@flourishyoga.studio", site: "https://flourishyoga.studio" },
};
const FROM_EMAIL = process.env.FROM_EMAIL || "info@iy-sp.com";
const FROM_NAME  = process.env.FROM_NAME  || "Iyengar Yoga St. Petersburg";
function locationInfo(loc) {
  return LOCATIONS[loc] || { name: FROM_NAME, replyTo: process.env.REPLY_TO || FROM_EMAIL, site: require("../config/studio").SITE_URL || "" };
}

const cents   = d => Math.round(Number(d) * 100);
const dollars = c => Math.round(c) / 100;

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function randomChars(n) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function newReceiptNo() {
  const d = todayStr().replace(/-/g, "").slice(2);
  for (let i = 0; i < 8; i++) {
    const no = `R-${d}-${randomChars(4)}`;
    if (!(await Order.exists({ receiptNo: no }))) return no;
  }
  return `R-${d}-${randomChars(8)}`;
}

async function newPassCode() {
  for (let i = 0; i < 8; i++) {
    const code = "YOGA-" + randomChars(4);
    if (!(await Pass.exists({ code }))) return code;
  }
  return "YOGA-" + randomChars(6);
}

// What the terminal can sell, with both prices so the screen can show the right one.
async function catalog({ includeCost = false } = {}) {
  const products = await Product.find({ active: true }).sort({ category: 1, name: 1 }).lean();
  return {
    taxRate: TAX_RATE,
    passes: Object.entries(PRICING.passes)
      .filter(([id]) => PASS_RULES[id])
      .map(([id, p]) => ({ id, label: p.label, classes: p.classes, cash: p.display, card: dollars(p.stripeAmount) })),
    memberships: Object.entries(PRICING.memberships)
      .filter(([id]) => MEMBERSHIP_CONFIG[id] && process.env[MEMBERSHIP_CONFIG[id].priceEnv])
      .map(([id, m]) => ({ id, label: m.label, sub: m.sub, card: m.actualCharge ?? m.display, display: m.display })),
    products: products.map(p => ({
      id: String(p._id), name: p.name, category: p.category || "General", sku: p.sku,
      price: p.price, stock: p.stock, taxable: p.taxable !== false,
      ...(includeCost ? { cost: p.cost } : {}),
    })),
  };
}

// items: [{ kind, id, quantity }] → priced order lines + totals. Throws Error with .status on bad input.
async function priceItems(rawItems, paymentMethod) {
  const bad = msg => Object.assign(new Error(msg), { status: 400 });
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw bad("The cart is empty.");
  if (!["cash", "card", "phone", "comp"].includes(paymentMethod)) throw bad("Choose how they're paying.");

  const byCard = paymentMethod === "card" || paymentMethod === "phone";
  const comp   = paymentMethod === "comp";
  const items  = [];

  for (const raw of rawItems) {
    const qty = Math.floor(Number(raw?.quantity) || 1);
    if (qty < 1 || qty > 99) throw bad("Quantity must be between 1 and 99.");

    if (raw.kind === "merch") {
      const p = await Product.findById(raw.id).lean().catch(() => null);
      if (!p || !p.active) throw bad("A product in the cart is no longer available.");
      if (p.stock < qty) throw bad(`Only ${p.stock} ${p.name} left in stock.`);
      const unit = cents(p.price);
      items.push({ kind: "merch", ref: String(p._id), name: p.name, quantity: qty,
                   unitC: comp ? 0 : unit, listC: unit, taxable: !comp && p.taxable !== false });
    } else if (raw.kind === "pass") {
      const p = PRICING.passes[raw.id];
      if (!p || !PASS_RULES[raw.id]) throw bad("Unknown pass.");
      const unit = byCard ? p.stripeAmount : cents(p.display);
      items.push({ kind: "pass", ref: raw.id, name: p.label, quantity: qty,
                   unitC: comp ? 0 : unit, listC: cents(p.display), taxable: false });
    } else if (raw.kind === "membership") {
      const m = PRICING.memberships[raw.id];
      const cfg = MEMBERSHIP_CONFIG[raw.id];
      if (!m || !cfg) throw bad("Unknown membership.");
      if (!process.env[cfg.priceEnv]) throw bad("That membership isn't set up for card payments yet.");
      if (!byCard) throw bad("Memberships renew monthly on a card: use Card or On their phone.");
      if (qty !== 1) throw bad("One membership at a time.");
      items.push({ kind: "membership", ref: raw.id, name: `${m.label} membership (first month)`, quantity: 1,
                   unitC: cents(m.actualCharge ?? m.display), listC: cents(m.display), taxable: false });
    } else {
      throw bad("Unknown item.");
    }
  }

  const hasMembership = items.some(i => i.kind === "membership");
  if (hasMembership && items.length > 1) throw bad("Sell a membership on its own, then ring up anything else separately.");

  // Tax on taxable merch only. Each line's tax is rounded; the last taxable line takes the rounding
  // difference so the lines always add up to the order's tax.
  const lineC = items.map(i => i.unitC * i.quantity);
  const taxableC = items.reduce((t, i, k) => t + (i.taxable ? lineC[k] : 0), 0);
  const taxC = Math.round(taxableC * TAX_RATE);
  let taxLeft = taxC;
  const lastTaxable = items.map(i => i.taxable).lastIndexOf(true);
  const lines = items.map((i, k) => {
    let t = 0;
    if (i.taxable) { t = k === lastTaxable ? taxLeft : Math.round(lineC[k] * TAX_RATE); taxLeft -= t; }
    return {
      kind: i.kind, ref: i.ref, name: i.name, quantity: i.quantity,
      unitPrice: dollars(i.unitC), listPrice: dollars(i.listC), lineTotal: dollars(lineC[k]),
      taxable: i.taxable, tax: dollars(t), passCodes: [],
    };
  });
  const subtotalC = lineC.reduce((a, b) => a + b, 0);
  return {
    items: lines, hasMembership,
    subtotal: dollars(subtotalC), tax: dollars(taxC), total: dollars(subtotalC + taxC),
    totalCents: subtotalC + taxC, taxRate: TAX_RATE,
  };
}

async function createOrder({ priced, student, paymentMethod, location, note, user }) {
  return Order.create({
    receiptNo: await newReceiptNo(),
    location: location || null,
    date: todayStr(),
    student: { name: (student?.name || "").trim(), email: (student?.email || "").trim().toLowerCase() },
    items: priced.items,
    subtotal: priced.subtotal, tax: priced.tax, total: priced.total, taxRate: priced.taxRate,
    paymentMethod, status: "pending", note: (note || "").slice(0, 500),
    soldBy: { userId: user?.id || null, name: user?.name || "Admin", role: user?.role || "" },
  });
}

// Marks a pending order paid and hands over what was bought: merch stock + Sale rows, passes,
// student record, receipt. Safe to call twice (browser + webhook): only the first call does the work.
async function fulfill(orderId, payment = {}) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { $set: { status: "paid", paidAt: new Date(), ...payment } },
    { new: true }
  );
  if (!order) return Order.findById(orderId);

  const email = order.student?.email || "";
  const name  = order.student?.name || "";
  const comp  = order.paymentMethod === "comp";
  const saleMethod = comp ? "comp" : order.paymentMethod === "cash" ? "cash" : "card";

  for (const item of order.items) {
    if (item.kind === "merch") {
      await Sale.create({
        productId: item.ref, productName: item.name, quantity: item.quantity,
        unitPrice: item.unitPrice, total: item.lineTotal, tax: item.tax,
        paymentMethod: saleMethod, date: order.date,
        orderId: order._id, receiptNo: order.receiptNo,
        soldBy: order.soldBy?.name || "", soldById: order.soldBy?.userId || null,
      });
      await Product.updateOne({ _id: item.ref }, { $inc: { stock: -item.quantity } });
    } else if (item.kind === "pass" && email) {
      const rule = PASS_RULES[item.ref];
      for (let n = 0; n < item.quantity; n++) {
        let expiresAt = null;
        if (rule?.expiryDays) { expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + rule.expiryDays); }
        const pass = await Pass.create({
          code: await newPassCode(),
          type: item.ref,
          studentEmail: email,
          classesTotal: PRICING.passes[item.ref]?.classes ?? 1,
          classesUsed: 0,
          expiresAt,
          active: true,
          stripePaymentId: order.stripePaymentIntentId || undefined,
          amountPaid: item.unitPrice,
          notes: `In person, receipt ${order.receiptNo}, sold by ${order.soldBy?.name || "staff"}${comp ? " (comp)" : ""}`,
          purchaseStatus: comp ? "comp" : "complete",
        });
        item.passCodes.push(pass.code);
      }
    }
  }
  order.markModified("items");
  await order.save();

  if (email) {
    const Student = require("../models/Student");
    await Student.findOneAndUpdate(
      { email },
      { ...(name ? { $set: { name } } : {}), $setOnInsert: { email, ...(name ? {} : { name: email.split("@")[0] }), firstVisit: new Date() } },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(err => console.error("✗ POS student upsert:", err.message));
  }

  // A membership's pass is made by the webhook; copy its code across if it's already there.
  if (order.stripeSubscriptionId) {
    const pass = await Pass.findOne({ stripeSubscriptionId: order.stripeSubscriptionId });
    if (pass) await attachMembershipPass(order._id, pass, { quiet: true });
  }

  await sendReceipt(order._id);
  console.log(`✓ POS ${order.receiptNo} paid (${order.paymentMethod}) $${order.total.toFixed(2)} by ${order.soldBy?.name}`);
  return Order.findById(order._id);
}

// Called from the webhook once the member Pass exists.
async function attachMembershipPass(orderId, pass) {
  const order = await Order.findById(orderId).catch(() => null);
  if (!order) return;
  const item = order.items.find(i => i.kind === "membership");
  if (!item || item.passCodes.includes(pass.code)) return;
  item.passCodes.push(pass.code);
  order.markModified("items");
  await order.save();
  await Pass.updateOne({ _id: pass._id, notes: { $in: [null, ""] } },
    { $set: { notes: `In person, receipt ${order.receiptNo}, sold by ${order.soldBy?.name || "staff"}` } });
}

// ── Receipt email ───────────────────────────────────────────
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => "$" + Number(n || 0).toFixed(2);
const PAY_LABEL = { cash: "Cash", card: "Card", phone: "Card (paid on phone)", comp: "Complimentary" };

function receiptHtml(order) {
  const loc = locationInfo(order.location);
  const first = (order.student?.name || "").split(" ")[0];
  const when = new Date(order.paidAt || order.createdAt).toLocaleString("en-US",
    { timeZone: TZ, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const rows = order.items.map(i => {
    const codes = i.passCodes?.length
      ? `<div style="margin-top:4px; font-size:13px; color:${s.colorPrimary}; font-weight:700; letter-spacing:0.06em;">${i.passCodes.map(esc).join(" · ")}</div>`
      : (i.kind === "membership" ? `<div style="margin-top:4px; font-size:12px; color:${s.colorTextMuted};">Your member code is in your welcome email.</div>` : "");
    return `<tr style="border-top:1px solid ${s.colorBorderLight};">
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${esc(i.name)}${i.quantity > 1 ? ` × ${i.quantity}` : ""}${codes}</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; text-align:right; white-space:nowrap; vertical-align:top;">${money(i.lineTotal)}</td>
    </tr>`;
  }).join("");

  const sumRow = (label, value, strong) => `<tr style="border-top:1px solid ${s.colorBorderLight};">
      <td style="padding:8px 20px; font-size:13px; color:${strong ? s.colorTextDark : s.colorTextMuted}; ${strong ? "font-weight:700;" : ""}">${label}</td>
      <td style="padding:8px 20px; font-size:${strong ? 16 : 13}px; color:${s.colorTextDark}; text-align:right; ${strong ? "font-weight:700;" : ""}">${value}</td>
    </tr>`;

  const hasPasses = order.items.some(i => i.kind === "pass" && i.passCodes?.length);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head>
<body style="margin:0; padding:0; background:${s.colorBgPage}; font-family:${s.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${s.colorBgPage}; padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:520px; background:${s.colorBgWhite}; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden;">
  <tr><td style="background:${s.colorPrimary}; padding:24px 40px; text-align:center;">
    <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px; letter-spacing:0.14em; text-transform:uppercase;">${esc(loc.name)}</p>
    <h1 style="margin:8px 0 0; color:${s.colorTextWhite}; font-size:26px; font-weight:300;">Your receipt</h1>
  </td></tr>
  <tr><td style="padding:28px 40px;">
    <p style="margin:0 0 20px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      ${first ? `Hi ${esc(first)}, thank` : "Thank"} you for your purchase.${hasPasses ? " Use the pass code below when you book a class." : ""}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:20px;">
      <tr style="background:${s.colorBgLight};"><td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600; color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Receipt ${esc(order.receiptNo)}</td></tr>
      ${rows}
      ${sumRow("Subtotal", money(order.subtotal))}
      ${order.tax > 0 ? sumRow(`Sales tax (${(order.taxRate * 100).toFixed(1).replace(/\.0$/, "")}%, merchandise)`, money(order.tax)) : ""}
      ${sumRow("Total", money(order.total), true)}
      ${sumRow("Paid by", PAY_LABEL[order.paymentMethod] || order.paymentMethod)}
    </table>
    <p style="margin:0; font-size:12px; color:${s.colorTextMuted}; line-height:1.6;">
      ${esc(when)} · served by ${esc(order.soldBy?.name || "the studio")}<br>
      Questions? Reply to this email or write to <a href="mailto:${esc(loc.replyTo)}" style="color:${s.colorPrimary}; text-decoration:none;">${esc(loc.replyTo)}</a>.
    </p>
    ${loc.site ? `<a href="${esc(loc.site)}" style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite}; padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px;">Book a class →</a>` : ""}
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function sendReceipt(orderId, { force = false } = {}) {
  const order = await Order.findById(orderId);
  if (!order || order.status !== "paid" || !order.student?.email) return { sent: false };
  if (order.receiptSentAt && !force) return { sent: false, already: true };
  const loc = locationInfo(order.location);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: loc.name, email: FROM_EMAIL },
      to: [{ email: order.student.email, ...(order.student.name ? { name: order.student.name } : {}) }],
      replyTo: { email: loc.replyTo },
      subject: `Your receipt from ${loc.name} (${order.receiptNo})`,
      htmlContent: receiptHtml(order),
    });
    await Order.updateOne({ _id: order._id }, { $set: { receiptSentAt: new Date(), receiptError: null } });
    console.log(`✓ POS receipt ${order.receiptNo} sent to ${order.student.email}`);
    return { sent: true };
  } catch (err) {
    console.error(`✗ POS receipt ${order.receiptNo} failed:`, err.message);
    await Order.updateOne({ _id: order._id }, { $set: { receiptError: err.message } });
    return { sent: false, error: err.message };
  }
}

module.exports = {
  TAX_RATE, todayStr, locationInfo, catalog, priceItems, createOrder, fulfill,
  attachMembershipPass, sendReceipt, receiptHtml,
};
