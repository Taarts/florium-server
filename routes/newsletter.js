const express    = require("express");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");
const multer     = require("multer");
const { BrevoClient } = require("@getbrevo/brevo");
const router     = express.Router();
const adminAuth  = require("../middleware/auth");
const { requireAuth } = require("../middleware/auth");
const staffAuth  = requireAuth("owner", "teacher");
const Student    = require("../models/Student");
const Class      = require("../models/Class");
const Booking    = require("../models/Booking");
const Newsletter = require("../models/Newsletter");
const { renderNewsletter, cleanBlocks, BRANDS, brandFor } = require("../newsletterRender");
const { getSignature } = require("../signatureRender");

const brevo        = require("../lib/brevoClient");
const PUBLIC_BASE  = process.env.PUBLIC_API_URL || "https://iy-sp.com/api";
const SENDER_EMAIL = process.env.NEWSLETTER_FROM_EMAIL || "info@iy-sp.com";
const REPLY_TO     = process.env.NEWSLETTER_REPLY_TO   || "info@iy-sp.com";
const studioCfg    = require("../config/studio");
// "all" plus each studio this server serves (IY-SP: iy-sp + flourish; single-studio servers like the demo: just "all")
const AUDIENCES    = studioCfg.STUDIOS.length > 1 ? ["all", ...studioCfg.STUDIOS] : ["all"];
const AUDIENCE_LABELS = { "all": "All students", "iy-sp": "IY-SP students", "flourish": "Flourish students" };
const audienceLabel   = k => AUDIENCE_LABELS[k] || `${k} students`;
const LIST_NAMES   = Object.fromEntries(AUDIENCES.map(k => [k, `Newsletter: ${audienceLabel(k)}`]));
const UPLOAD_DIR   = path.join(__dirname, "..", "uploads", "newsletter");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function brevoMsg(err) {
  return err?.body?.message || err?.message || "Brevo request failed";
}

// ═══ Who sees / changes what ═══════════════════════════════
// Owners: everything. Teachers: only newsletters they created, and only while draft.
// Teachers submit for approval; only owners send.
const isOwner  = req => req.user?.role === "owner";
const mine     = req => (isOwner(req) ? {} : { "createdBy.userId": req.user.id });
const editable = req => (isOwner(req) ? ["draft", "submitted"] : ["draft"]);
const author   = req => ({ userId: req.user.id, name: req.user.name || "", email: req.user.email || "", role: req.user.role });
// Teachers sign as themselves ("me") or not at all — never with the studio's saved signatures
function teacherSig(req, data, isNew) {
  if (isOwner(req)) return data;
  if (isNew && !data.signatureId) data.signatureId = "me";
  if ("signatureId" in data && !["me", "none"].includes(data.signatureId)) data.signatureId = "me";
  return data;
}

// ═══ Audience (app side) ═══════════════════════════════════
async function resolveRecipients(audience) {
  const notUnsub = { emailUnsubscribed: { $ne: true } };
  if (audience === "all") return Student.find(notUnsub, "_id email name").lean();

  const studioQuery = audience === "iy-sp"
    ? { $or: [{ studio: "iy-sp" }, { studio: { $exists: false } }] }
    : { studio: audience };
  const classes = await Class.find(studioQuery).lean();
  const ids = [];
  for (const c of classes) {
    ids.push(c._id, String(c._id));
    if (c.id) ids.push(c.id);
  }
  if (!ids.length) return [];

  const emails = await Booking.collection.distinct("studentEmail", { classId: { $in: ids } });
  if (!emails.length) return [];
  return Student.find(
    { ...notUnsub, email: { $in: emails.map(e => String(e).toLowerCase()) } },
    "_id email name"
  ).lean();
}

// ═══ Brevo lists ═══════════════════════════════════════════
let listCache = null;
let lastSync  = null;   // { at, counts }
let syncing   = null;   // in-flight promise

async function ensureLists() {
  if (listCache) return listCache;
  const found = {};
  for (let offset = 0; ; offset += 50) {
    const r = await brevo.contacts.getLists({ limit: 50, offset });
    for (const l of r.lists || []) {
      for (const k of AUDIENCES) if (l.name === LIST_NAMES[k]) found[k] = l.id;
    }
    if (!r.lists || r.lists.length < 50) break;
  }
  const missing = AUDIENCES.filter(k => !found[k]);
  if (missing.length) {
    const f = await brevo.contacts.getFolders({ limit: 10, offset: 0 });
    let folderId = f.folders?.[0]?.id;
    if (!folderId) folderId = (await brevo.contacts.createFolder({ name: "Studio" })).id;
    for (const k of missing) {
      found[k] = (await brevo.contacts.createList({ name: LIST_NAMES[k], folderId })).id;
    }
  }
  listCache = found;
  return found;
}

function nameAttrs(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return { FIRSTNAME: parts[0] || "", LASTNAME: parts.slice(1).join(" ") };
}

async function syncLists() {
  if (syncing) return syncing;
  syncing = (async () => {
    const lists  = await ensureLists();
    const counts = {};
    for (const aud of AUDIENCES) {
      const people = await resolveRecipients(aud);
      counts[aud] = people.length;
      for (let i = 0; i < people.length; i += 1000) {
        await brevo.contacts.importContacts({
          jsonBody: people.slice(i, i + 1000).map(p => ({ email: p.email, attributes: nameAttrs(p.name) })),
          listIds: [lists[aud]],
          updateExistingContacts: true,
          emptyContactsAttributes: false,
          disableNotification: true,
        });
      }
    }
    lastSync = { at: new Date(), counts };
    return lastSync;
  })().finally(() => { syncing = null; });
  return syncing;
}

// ═══ Brevo campaign ════════════════════════════════════════
function campaignFields(nl, signature) {
  const brand = brandFor(nl);
  return {
    name:        `${nl.subject} — ${new Date().toISOString().slice(0, 10)}`,
    subject:     nl.subject,
    previewText: nl.previewText || undefined,
    sender:      { name: brand.sender, email: SENDER_EMAIL },
    replyTo:     REPLY_TO,
    htmlContent: renderNewsletter(nl, { mode: "brevo", signature }),
  };
}

async function upsertCampaign(nl) {
  const lists  = await ensureLists();
  const signature = await getSignature(nl.signatureId, nl.createdBy);
  const fields = { ...campaignFields(nl, signature), recipients: { listIds: [lists[nl.audience] ?? lists.all] } };
  if (nl.brevoCampaignId) {
    try {
      await brevo.emailCampaigns.updateEmailCampaign({ campaignId: nl.brevoCampaignId, ...fields });
      return nl.brevoCampaignId;
    } catch (err) {
      if (err?.statusCode !== 404) throw err;   // deleted in Brevo → create a new one
    }
  }
  const { id } = await brevo.emailCampaigns.createEmailCampaign(fields);
  await Newsletter.updateOne({ _id: nl._id }, { $set: { brevoCampaignId: id } });
  return id;
}

// ═══ Input ═════════════════════════════════════════════════
function cleanInput(body) {
  const out = {};
  if (typeof body.subject     === "string") out.subject     = body.subject.trim().slice(0, 200);
  if (typeof body.previewText === "string") out.previewText = body.previewText.trim().slice(0, 200);
  if (typeof body.headerTitle === "string") out.headerTitle = body.headerTitle.trim().slice(0, 100);
  if (typeof body.headerColor === "string") out.headerColor = /^#[0-9a-f]{6}$/i.test(body.headerColor) ? body.headerColor : "";
  if (typeof body.greeting    === "boolean") out.greeting   = body.greeting;
  if (AUDIENCES.includes(body.audience))    out.audience    = body.audience;
  if (studioCfg.STUDIOS.includes(body.brand)) out.brand     = body.brand;
  if (Array.isArray(body.blocks))           out.blocks      = cleanBlocks(body.blocks);
  if (typeof body.signatureId === "string" && /^(default|me|none|[a-f0-9]{24})$/.test(body.signatureId)) out.signatureId = body.signatureId;
  return out;
}

// ═══ Staff: images ═════════════════════════════════════════
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + EXT[file.mimetype]),
  }),
  limits: { fileSize: (Number(process.env.UPLOAD_MAX_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT[file.mimetype])),
});

router.post("/images", staffAuth, (req, res) => {
  upload.single("image")(req, res, async err => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image is over 5 MB." : err.message });
    if (!req.file) return res.status(400).json({ error: "Upload a JPG, PNG or GIF." });
    const localUrl = `${PUBLIC_BASE}/newsletter/images/${req.file.filename}`;
    // Copy into Brevo's image gallery so the email doesn't depend on this server
    try {
      const r = await brevo.emailCampaigns.uploadImageToGallery({ imageUrl: localUrl, name: req.file.filename });
      return res.json({ url: r?.url || localUrl });
    } catch (e) {
      console.error("✗ Brevo gallery upload failed, using local URL:", brevoMsg(e));
      return res.json({ url: localUrl });
    }
  });
});

// ═══ Public: uploaded images (Brevo fetches from here) ═════
router.get("/images/:file", (req, res) => {
  const file = path.basename(req.params.file);
  if (!/^[a-f0-9]{24}\.(jpg|png|gif)$/.test(file)) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, file), { maxAge: "365d", immutable: true }, err => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// ═══ Staff: preview & lists ════════════════════════════════
router.post("/render", staffAuth, async (req, res, next) => {
  try {
    const nl = teacherSig(req, { subject: "", audience: "all", greeting: true, blocks: [], signatureId: isOwner(req) ? "default" : "me", ...cleanInput(req.body || {}) }, false);
    // "Me" previews as the author: the teacher who wrote it, even when the owner is reviewing
    let who = req.user;
    if (isOwner(req) && /^[a-f0-9]{24}$/.test(String(req.body?._id || ""))) {
      const src = await Newsletter.findById(req.body._id, "createdBy").lean();
      if (src?.createdBy) who = src.createdBy;
    }
    const signature = await getSignature(nl.signatureId, who);
    res.json({ html: renderNewsletter(nl, { mode: "preview", signature }) });
  } catch (err) { next(err); }
});

router.get("/lists", staffAuth, async (req, res) => {
  const meta = {
    audiences:    AUDIENCES.map(k => ({ value: k, label: audienceLabel(k) })),
    defaultColor: BRANDS.all.color,
  };
  try {
    const out = {};
    if (studioCfg.DEMO_MODE) {
      // No Brevo in the demo: count straight from the database
      for (const k of AUDIENCES) out[k] = { id: 0, subscribers: (await resolveRecipients(k)).length, blacklisted: 0 };
    } else {
      const lists = await ensureLists();
      for (const k of AUDIENCES) {
        const l = await brevo.contacts.getList({ listId: lists[k] });
        out[k] = { id: lists[k], subscribers: l.uniqueSubscribers ?? l.totalSubscribers ?? 0, blacklisted: l.totalBlacklisted ?? 0 };
      }
    }
    res.json({ ...meta, lists: out, lastSync, syncing: Boolean(syncing) });
  } catch (err) {
    res.status(502).json({ ...meta, error: brevoMsg(err) });
  }
});

router.post("/sync", adminAuth, async (req, res) => {
  try {
    res.json({ ok: true, ...(await syncLists()) });
  } catch (err) {
    res.status(502).json({ error: brevoMsg(err) });
  }
});

// ═══ Staff: drafts ═════════════════════════════════════════
router.get("/", staffAuth, async (req, res, next) => {
  try {
    const newsletters = await Newsletter.find(mine(req)).sort({ createdAt: -1 }).limit(50).lean();
    // Owner: anything waiting for approval goes first
    if (isOwner(req)) newsletters.sort((a, b) => (b.status === "submitted") - (a.status === "submitted"));
    res.json({ newsletters });
  } catch (err) { next(err); }
});

router.get("/:id", staffAuth, async (req, res, next) => {
  try {
    const newsletter = await Newsletter.findOne({ _id: req.params.id, ...mine(req) }).lean();
    if (!newsletter) return res.status(404).json({ error: "Not found." });
    res.json({ newsletter });
  } catch (err) { next(err); }
});

router.post("/", staffAuth, async (req, res, next) => {
  try {
    const data = teacherSig(req, cleanInput(req.body || {}), true);
    if (!data.subject) return res.status(400).json({ error: "Subject is required." });
    res.status(201).json({ newsletter: await Newsletter.create({ ...data, createdBy: author(req) }) });
  } catch (err) { next(err); }
});

router.put("/:id", staffAuth, async (req, res, next) => {
  try {
    const data = teacherSig(req, cleanInput(req.body || {}), false);
    if ("subject" in data && !data.subject) return res.status(400).json({ error: "Subject is required." });
    const doc = await Newsletter.findOneAndUpdate(
      { _id: req.params.id, ...mine(req), status: { $in: editable(req) } },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(409).json({ error: isOwner(req)
        ? "Sent newsletters can't be edited."
        : "Only your drafts can be edited. Withdraw a submitted newsletter to change it." });
    }
    res.json({ newsletter: doc });
  } catch (err) { next(err); }
});

router.delete("/:id", staffAuth, async (req, res, next) => {
  try {
    const doc = await Newsletter.findOneAndDelete({ _id: req.params.id, ...mine(req), status: { $in: editable(req) } });
    if (!doc) return res.status(409).json({ error: "Only drafts can be deleted." });
    if (doc.brevoCampaignId) {
      brevo.emailCampaigns.deleteEmailCampaign({ campaignId: doc.brevoCampaignId })
        .catch(e => console.error("✗ Brevo draft campaign delete failed:", brevoMsg(e)));
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/:id/duplicate", staffAuth, async (req, res, next) => {
  try {
    const src = await Newsletter.findOne({ _id: req.params.id, ...mine(req) }).lean();
    if (!src) return res.status(404).json({ error: "Not found." });
    const { subject, previewText, audience, brand, headerTitle, headerColor, greeting, blocks, signatureId } = src;
    const doc = await Newsletter.create({
      subject: `${subject} (copy)`, previewText, audience, brand, headerTitle, headerColor, greeting, blocks, signatureId,
      createdBy: author(req),
    });
    res.status(201).json({ newsletter: doc });
  } catch (err) { next(err); }
});

// ═══ Teacher → owner approval ══════════════════════════════
router.post("/:id/submit", staffAuth, async (req, res, next) => {
  try {
    const existing = await Newsletter.findOne({ _id: req.params.id, ...mine(req) }).lean();
    if (!existing) return res.status(404).json({ error: "Not found." });
    if (!existing.blocks?.length) return res.status(400).json({ error: "Add some content first." });
    const doc = await Newsletter.findOneAndUpdate(
      { _id: existing._id, status: "draft" },
      { $set: { status: "submitted", submittedAt: new Date(), reviewNote: "" } },
      { new: true }
    );
    if (!doc) return res.status(409).json({ error: "Only drafts can be submitted." });
    res.json({ newsletter: doc });
  } catch (err) { next(err); }
});

// Owner: return to the teacher with a note. Teacher: withdraw their own submission.
router.post("/:id/return", staffAuth, async (req, res, next) => {
  try {
    const note = isOwner(req) ? String(req.body?.note || "").trim().slice(0, 1000) : "";
    const doc = await Newsletter.findOneAndUpdate(
      { _id: req.params.id, ...mine(req), status: "submitted" },
      { $set: { status: "draft", reviewNote: note, submittedAt: null } },
      { new: true }
    );
    if (!doc) return res.status(409).json({ error: "Only submitted newsletters can be returned." });
    res.json({ newsletter: doc });
  } catch (err) { next(err); }
});

// ═══ Test & send ═══════════════════════════════════════════
router.post("/:id/test", staffAuth, async (req, res, next) => {
  try {
    // Teachers can only test-send to their own login email
    const to = isOwner(req)
      ? String(req.body?.to || "").trim().toLowerCase()
      : String(req.user.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: "Enter a valid test email address." });
    const nl = await Newsletter.findOne({ _id: req.params.id, ...mine(req), status: { $in: editable(req) } });
    if (!nl) return res.status(409).json({ error: "Only drafts can be test-sent." });
    if (!nl.blocks?.length) return res.status(400).json({ error: "Add some content first." });

    const campaignId = await upsertCampaign(nl);
    await brevo.emailCampaigns.sendTestEmail({ campaignId, body: { emailTo: [to] } });
    await Newsletter.updateOne({ _id: nl._id }, { $set: { lastTestSentAt: new Date(), lastTestSentTo: to } });
    res.json({ ok: true, to });
  } catch (err) {
    if (err?.statusCode) return res.status(502).json({ error: brevoMsg(err) });
    next(err);
  }
});

router.post("/:id/send", adminAuth, async (req, res, next) => {
  let nl;
  let prevStatus = "draft";
  try {
    const existing = await Newsletter.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: "Not found." });
    if (!existing.blocks?.length) return res.status(400).json({ error: "Add some content first." });
    prevStatus = existing.status === "submitted" ? "submitted" : "draft";

    // Atomic draft/submitted → sending: a second click gets 409, never a double send
    nl = await Newsletter.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["draft", "submitted"] } },
      { $set: { status: "sending", sendError: null } },
      { new: true }
    );
    if (!nl) return res.status(409).json({ error: "This newsletter has already been sent or is sending." });

    const campaignId = await upsertCampaign(nl);
    await brevo.emailCampaigns.sendEmailCampaignNow({ campaignId });
    await Newsletter.updateOne({ _id: nl._id }, { $set: { status: "sent", sentAt: new Date(), brevoCampaignId: campaignId } });
    res.json({ ok: true, campaignId });
  } catch (err) {
    if (nl) {
      await Newsletter.updateOne({ _id: nl._id }, { $set: { status: prevStatus, sendError: brevoMsg(err) } }).catch(() => {});
      return res.status(502).json({ error: brevoMsg(err) });
    }
    next(err);
  }
});

router.get("/:id/stats", staffAuth, async (req, res, next) => {
  try {
    const nl = await Newsletter.findOne({ _id: req.params.id, ...mine(req) });
    if (!nl?.brevoCampaignId) return res.status(404).json({ error: "Not sent yet." });
    const c = await brevo.emailCampaigns.getEmailCampaign({
      campaignId: nl.brevoCampaignId, statistics: "globalStats", excludeHtmlContent: true,
    });
    const g = c.statistics?.globalStats || {};
    const stats = {
      brevoStatus:  c.status,
      sent:         g.sent ?? 0,
      delivered:    g.delivered ?? 0,
      opens:        g.uniqueViews ?? 0,
      clicks:       g.uniqueClicks ?? 0,
      unsubscribes: g.unsubscriptions ?? 0,
      bounces:      (g.hardBounces ?? 0) + (g.softBounces ?? 0),
    };
    nl.stats = stats;
    nl.statsAt = new Date();
    await nl.save();
    res.json({ stats });
  } catch (err) {
    if (err?.statusCode) return res.status(502).json({ error: brevoMsg(err) });
    next(err);
  }
});

module.exports = router;
