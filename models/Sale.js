const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName:   { type: String, required: true },
  quantity:      { type: Number, required: true, min: 1 },
  unitPrice:     { type: Number, required: true },
  total:         { type: Number, required: true },
  paymentMethod: { type: String, enum: ["cash", "card"], required: true },
  date:          { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

module.exports = mongoose.model("Sale", saleSchema);