const express  = require("express");
const router   = express.Router();
const Product  = require("../models/Product");
const Sale     = require("../models/Sale");
const adminAuth = require("../middleware/auth");

function generateSKU() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sku = "FLO-";
  for (let i = 0; i < 5; i++) sku += chars[Math.floor(Math.random() * chars.length)];
  return sku;
}

// ── GET /api/merch/products ───────────────────────────────
router.get("/products", adminAuth, async (req, res) => {
  try {
    const products = await Product.find().sort({ category: 1, name: 1 });
    res.json({ products });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/merch/products ──────────────────────────────
router.post("/products", adminAuth, async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;
    if (!name || price == null) return res.status(400).json({ error: "Name and price are required." });
    const product = await Product.create({ name, category, price, stock: stock ?? 0, sku: generateSKU() });
    res.status(201).json({ product });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/merch/products/:id ────────────────────────
router.patch("/products/:id", adminAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/merch/products/:id ───────────────────────
router.delete("/products/:id", adminAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/merch/sales ─────────────────────────────────
router.post("/sales", adminAuth, async (req, res) => {
  try {
    const { productId, quantity, paymentMethod, date } = req.body;
    if (!productId || !quantity || !paymentMethod || !date)
      return res.status(400).json({ error: "Missing required fields." });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found." });
    if (product.stock < quantity) return res.status(400).json({ error: "Insufficient stock." });

    const total = product.price * quantity;
    const sale  = await Sale.create({
      productId, productName: product.name,
      quantity, unitPrice: product.price, total,
      paymentMethod, date,
    });

    await Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } });

    res.status(201).json({ sale, stockRemaining: product.stock - quantity });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/merch/sales ──────────────────────────────────
router.get("/sales", adminAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from) filter.date = { ...filter.date, $gte: from };
    if (to)   filter.date = { ...filter.date, $lte: to };
    const sales = await Sale.find(filter).sort({ createdAt: -1 });
    res.json({ sales });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/merch/report ─────────────────────────────────
router.get("/report", adminAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from) filter.date = { ...filter.date, $gte: from };
    if (to)   filter.date = { ...filter.date, $lte: to };

    const sales    = await Sale.find(filter);
    const products = await Product.find().sort({ category: 1, name: 1 });

    // Build product map for cost/taxable lookup
    const productMap = {};
    for (const p of products) productMap[p._id.toString()] = p;

    // Tax rate — Florida default 7%
    const TAX_RATE = 0.07;

    const byProduct = {};
    for (const s of sales) {
      const id  = s.productId.toString();
      const p   = productMap[id];
      const tax = p?.taxable ? s.total * TAX_RATE : 0;
      const cogs = (p?.cost ?? 0) * s.quantity;

      if (!byProduct[id]) byProduct[id] = {
        productName: s.productName, quantity: 0, revenue: 0,
        cogs: 0, tax: 0, profit: 0, cash: 0, card: 0,
      };
      byProduct[id].quantity += s.quantity;
      byProduct[id].revenue  += s.total;
      byProduct[id].cogs     += cogs;
      byProduct[id].tax      += tax;
      byProduct[id].profit   += s.total - cogs - tax;
      if (s.paymentMethod === "cash") byProduct[id].cash += s.total;
      else                            byProduct[id].card += s.total;
    }

    const grandRevenue = Object.values(byProduct).reduce((s, p) => s + p.revenue, 0);
    const grandCOGS    = Object.values(byProduct).reduce((s, p) => s + p.cogs, 0);
    const grandTax     = Object.values(byProduct).reduce((s, p) => s + p.tax, 0);
    const grandProfit  = Object.values(byProduct).reduce((s, p) => s + p.profit, 0);
    const cashTotal    = sales.filter(s => s.paymentMethod === "cash").reduce((s, sale) => s + sale.total, 0);
    const cardTotal    = sales.filter(s => s.paymentMethod === "card").reduce((s, sale) => s + sale.total, 0);

    res.json({
      byProduct,
      products: products.map(p => ({
        _id: p._id, name: p.name, category: p.category, sku: p.sku,
        price: p.price, cost: p.cost, stock: p.stock, taxable: p.taxable, active: p.active,
      })),
      totals: {
        grandRevenue, grandCOGS, grandTax, grandProfit,
        cashTotal, cardTotal,
        unitsSold: sales.reduce((s, sale) => s + sale.quantity, 0),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;