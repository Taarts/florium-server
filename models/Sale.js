const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName:   { type: String, required: true },
  quantity:      { type: Number, required: true, min: 1 },
  unitPrice:     { type: Number, required: true },
  total:         { type: Number, required: true },
  paymentMethod: { type: String, enum: ["cash", "card", "comp"], required: true },
  date:          { type: String, required: true }, // YYYY-MM-DD
  // Sales terminal (models/Order.js). tax is on top of total; null on older sales.
  tax:           { type: Number, default: null },
  orderId:       { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  receiptNo:     { type: String, default: null },
  soldBy:        { type: String, default: null },
  soldById:      { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Sale", saleSchema);