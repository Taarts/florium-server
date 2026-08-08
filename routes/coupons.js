const express   = require("express");
const router    = express.Router();
const Coupon    = require("../models/Coupon");
const adminAuth = require("../middleware/auth");

router.post("/validate", async (req, res) => {
  try {
    const { code, passType } = req.body;
    if (!code) return res.status(400).json({ error: "Code is required." });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

    if (!coupon || !coupon.active) {
      return res.status(404).json({ valid: false, error: "Invalid or expired code." });
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return res.status(400).json({ valid: false, error: "This code has expired." });
    }

    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ valid: false, error: "This code has reached its usage limit." });
    }

    if (coupon.appliesToTypes.length > 0 && passType && !coupon.appliesToTypes.includes(passType)) {
      return res.status(400).json({ valid: false, error: "This code does not apply to this purchase." });
    }

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
    const { code, type, amount, appliesToTypes, maxUses, expiresAt } = req.body;
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

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
