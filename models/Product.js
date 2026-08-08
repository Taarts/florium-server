const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  category: { type: String, default: "General", trim: true },
  sku:      { type: String, unique: true },
  price:    { type: Number, required: true, min: 0 },
  cost:     { type: Number, default: 0, min: 0 },
  stock:    { type: Number, required: true, min: 0, default: 0 },
  taxable:  { type: Boolean, default: true },
  active:   { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);