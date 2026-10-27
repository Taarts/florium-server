const express   = require("express");
const router    = express.Router();
const Coupon    = require("../models/Coupon");
const adminAuth = require("../middleware/auth");

const MEMBERSHIP_TYPES = ["member2x", "memberUnl"];

// Accepts an array or a pasted block (newlines / commas / semicolons)
function normalizeEmails(v) {
  const list = Array.isArray(v) ? v : String(v || "").split(/[\s,;]+/);
  return [...new Set(list.map(e => String(e).toLowerCase().trim()).filter(e => e.includes("@")))];
}

function normalizeMemberships(v) {
  return (Array.isArray(v) ? v : []).filter(m => MEMBERSHIP_TYPES.includes(m));
}

router.post("/validate", async (req, res) => {
  try {
    const { code, passType, email } = req.body;
    if (!code) return res.status(400).json({ error: "Code is required." });

    const { checkCoupon } = require("../utils/classPayment");
    const cleanEmail = String(email || "").toLowerCase().trim();

    // Email-only and members-only codes need the student's email before they can be checked
    if (!cleanEmail) {
      const found = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
      if (found && (found.allowedEmails.length || found.allowedMemberships.length || found.membersOnly))
        return res.status(400).json({ valid: false, error: "Enter your email address first, then apply the code." });
    }

    const c = await checkCoupon(code, cleanEmail, passType || "dropin");
    if (c.error) return res.status(400).json({ valid: false, error: c.error });
    const coupon = c.coupon;

    const displayText = coupon.type === "percent"
      ? `${coupon.amount}% off`
      : `$${coupon.amount.toFixed(2)} off`;

    res.json({
      valid: true,
      discount: { code: coupon.code, type: coupon.type, amount: coupon.amount, displayText },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", adminAuth, async (req, res) => {
  try {
    const { code, type, amount, appliesToTypes, maxUses, expiresAt, membersOnly,
            allowedEmails, allowedMemberships } = req.body;
    if (!code || !type || amount == null) {
      return res.status(400).json({ error: "code, type, and amount are required." });
    }
    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type,
      amount: Number(amount),
      appliesToTypes: appliesToTypes ?? [],
      maxUses: Number(maxUses) || 0,
      expiresAt: expiresAt || null,
      membersOnly: !!membersOnly,
      allowedEmails: normalizeEmails(allowedEmails),
      allowedMemberships: normalizeMemberships(allowedMemberships),
    });
    res.status(201).json({ coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "A coupon with this code already exists." });
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/deactivate", adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!coupon) return res.status(404).json({ error: "Coupon not found." });
    res.json({ coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/coupons/:id — edit everything except the code itself
router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const { type, amount, appliesToTypes, maxUses, expiresAt, allowedEmails, allowedMemberships } = req.body;
    const update = {};
    if (type) update.type = type;
    if (amount != null) update.amount = Number(amount);
    if (Array.isArray(appliesToTypes)) update.appliesToTypes = appliesToTypes;
    if (maxUses != null) update.maxUses = Number(maxUses) || 0;
    if (expiresAt !== undefined) update.expiresAt = expiresAt || null;
    if (allowedEmails !== undefined) update.allowedEmails = normalizeEmails(allowedEmails);
    if (allowedMemberships !== undefined) {
      update.allowedMemberships = normalizeMemberships(allowedMemberships);
      update.membersOnly = false; // superseded by explicit memberships
    }
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ error: "Coupon not found." });
    res.json({ coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
