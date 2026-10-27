const express   = require("express");
const router    = express.Router();
const adminAuth = require("../middleware/auth");
const Signature = require("../models/Signature");
const { renderSignature } = require("../signatureRender");

const FIELDS = ["label", "signOff", "name", "title", "photo", "phone", "email", "website"];

function clean(body) {
  const out = {};
  for (const f of FIELDS) {
    if (typeof body?.[f] === "string") out[f] = body[f].trim().slice(0, f === "photo" ? 1000 : 200);
  }
  return out;
}

async function makeOnlyDefault(id) {
  await Signature.updateMany({ _id: { $ne: id } }, { $set: { isDefault: false } });
  await Signature.updateOne({ _id: id }, { $set: { isDefault: true } });
}

// Teachers can read signatures (newsletter picker); only owners change them
const { requireAuth } = require("../middleware/auth");
const staffAuth = requireAuth("owner", "teacher");
router.use((req, res, next) => (req.method === "GET" ? staffAuth : adminAuth)(req, res, next));

router.get("/", async (req, res, next) => {
  try {
    const signatures = await Signature.find().sort({ isDefault: -1, createdAt: 1 }).lean();
    res.json({ signatures });
  } catch (err) { next(err); }
});

router.post("/render", (req, res) => {
  res.json({ html: renderSignature(clean(req.body), { accent: /^#[0-9a-f]{6}$/i.test(req.body?.accent || "") ? req.body.accent : undefined }) });
});

router.post("/", async (req, res, next) => {
  try {
    const data = clean(req.body);
    if (!data.label || !data.name) return res.status(400).json({ error: "Label and name are required." });
    const first = (await Signature.countDocuments()) === 0;
    const sig = await Signature.create({ ...data, isDefault: first });
    if (req.body?.isDefault === true && !first) await makeOnlyDefault(sig._id);
    res.status(201).json({ signature: await Signature.findById(sig._id).lean() });
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const data = clean(req.body);
    if ("label" in data && !data.label) return res.status(400).json({ error: "Label is required." });
    if ("name"  in data && !data.name)  return res.status(400).json({ error: "Name is required." });
    const sig = await Signature.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
    if (!sig) return res.status(404).json({ error: "Not found." });
    if (req.body?.isDefault === true) await makeOnlyDefault(sig._id);
    res.json({ signature: await Signature.findById(sig._id).lean() });
  } catch (err) { next(err); }
});

router.post("/:id/default", async (req, res, next) => {
  try {
    const sig = await Signature.findById(req.params.id);
    if (!sig) return res.status(404).json({ error: "Not found." });
    await makeOnlyDefault(sig._id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const sig = await Signature.findByIdAndDelete(req.params.id);
    if (!sig) return res.status(404).json({ error: "Not found." });
    if (sig.isDefault) {
      const promote = await Signature.findOne().sort({ createdAt: 1 });
      if (promote) await makeOnlyDefault(promote._id);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
