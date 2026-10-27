const mongoose = require("mongoose");

// One in-person sale (the sales terminal in the admin). Holds every item rung up together,
// who sold it, how it was paid, and the receipt that was emailed.
// Merch lines also write a Sale row (stock + merch report); pass lines create Pass records.
// Memberships are always sold on their own: Stripe creates the subscription, the webhook
// creates the member Pass, and the code is copied back onto the item here.
const itemSchema = new mongoose.Schema({
  kind:      { type: String, enum: ["merch", "pass", "membership"], required: true },
  ref:       { type: String, required: true },          // Product _id, or pass/membership type
  name:      { type: String, required: true },
  quantity:  { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },          // dollars charged per unit
  listPrice: { type: Number, default: null },           // dollars before comp
  lineTotal: { type: Number, required: true },          // dollars, before tax
  taxable:   { type: Boolean, default: false },
  tax:       { type: Number, default: 0 },              // dollars
  passCodes: { type: [String], default: [] },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true, unique: true },
  location:  { type: String, default: null },           // which site it was sold on: iy-sp | flourish | demo
  date:      { type: String, required: true },          // YYYY-MM-DD (studio local)
  student: {
    name:  { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
  },
  items:    { type: [itemSchema], default: [] },
  subtotal: { type: Number, required: true },
  tax:      { type: Number, default: 0 },
  total:    { type: Number, required: true },
  taxRate:  { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ["cash", "card", "phone", "comp"], required: true },
  status:   { type: String, enum: ["pending", "paid", "cancelled"], default: "pending", index: true },
  note:     { type: String, default: "" },

  soldBy: {
    userId: { type: String, default: null },
    name:   { type: String, default: "" },
    role:   { type: String, default: "" },
  },

  stripePaymentIntentId:   { type: String, default: null },
  stripeSubscriptionId:    { type: String, default: null },
  stripeCheckoutSessionId: { type: String, default: null },
  checkoutUrl:             { type: String, default: null },

  paidAt:         { type: Date, default: null },
  receiptSentAt:  { type: Date, default: null },
  receiptError:   { type: String, default: null },
}, { timestamps: true });

orderSchema.index({ date: 1, status: 1 });
orderSchema.index({ "soldBy.userId": 1, date: 1 });

module.exports = mongoose.model("Order", orderSchema);
