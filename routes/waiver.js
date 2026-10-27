// server/routes/waiver.js
// CHANGED FROM LOCAL STORAGE: PDFs now uploaded to S3 via s3.js helper.
// Student.waiverPdfPath now stores the S3 key (e.g. "waivers/2026-05-08_email@example.com.pdf")
// instead of a local filesystem path.

const express  = require("express");
const router   = express.Router();
const PDFDoc   = require("pdfkit");
const Student  = require("../models/Student");
const adminAuth = require("../middleware/auth");
const { sendWaiverEmail } = require("../email");
const { uploadToS3, getWaiverUrl, getWaiverBuffer } = require("../s3");

// ---------------------------------------------------------------------------
// Waiver text — returns sections with [STUDENT_NAME] tokens intact
// ---------------------------------------------------------------------------
function waiverText() {
  return [
    {
      heading: "",
      body: "For and in consideration of permitting me to enroll and participate in the Iyengar Yoga St. Petersburg online and/or live classes and the activities and instruction given and conducted by the Iyengar Yoga St. Petersburg, in the County of Pinellas, State of Florida.",
    },
    {
      heading: "Release of Liability",
      body: "I, [STUDENT_NAME], voluntarily release, discharge, waive, and relinquish all claims of liability against the Iyengar Yoga St. Petersburg including but not limited to any and all actions or causes of action for personal injury, death, or property damage occurring to me as a result of engaging or receiving instruction online or in person at the Iyengar Yoga St. Petersburg studio, in any activities or instruction incidental thereto or merely as the result of being enrolled at the Iyengar Yoga St. Petersburg, wherever or however any such injury, death, or property damage may occur, whether by the negligence of the Iyengar Yoga St. Petersburg or any of its officers, agents, servants or employees, or otherwise, and for the entire period that I am enrolled at Iyengar Yoga St. Petersburg or participating in activities or instruction online or at the studio at the Iyengar Yoga St. Petersburg.",
    },
    {
      heading: "Assumption of Risk",
      body: "I, [STUDENT_NAME], assume full responsibility for all risk of bodily injury, death, or property damage caused by the negligence of the Iyengar Yoga St. Petersburg, or any of the Iyengar Yoga St. Petersburg officers, agents, servants or employees, or otherwise, while enrolled at the Iyengar Yoga St. Petersburg or engaged in any activity or instruction with the Iyengar Yoga St. Petersburg. I for myself, and my heirs, executors, administrators, personal representatives, and assigns release, waive, discharge, and relinquish any action or cause of action for personal injury, death, or property damage that may arise from being enrolled at the Iyengar Yoga St. Petersburg or participating in any instruction or activities conducted by the Iyengar Yoga St. Petersburg — online or in the studio, and agrees that under no circumstances will I prosecute or present any claim for personal injury, death, or property damage against the Iyengar Yoga St. Petersburg or any of the Iyengar Yoga St. Petersburg officers, agents, servants or employees for personal injury, death or property damage arising from enrollment at the Iyengar Yoga St. Petersburg or from participating in any activities or instruction conducted by the Iyengar Yoga St. Petersburg, whether such personal injury, death, or property damage be caused by the negligence of the Iyengar Yoga St. Petersburg or any of the Iyengar Yoga St. Petersburg officers, agents, servants or employees.",
    },
    {
      heading: "Indemnification",
      body: "I, [STUDENT_NAME], for myself and my heirs, executors, administrators, personal representatives, and assigns agree that in the event that any claim for personal injury, death, or property damage shall be prosecuted against the Iyengar Yoga St. Petersburg on behalf of the student or his or her heirs, executors, administrators, personal representatives and assigns, I shall indemnify and save harmless the Iyengar Yoga St. Petersburg from any and all such claims or causes of action by whomever made and wherever and whenever.",
    },
    {
      heading: "Additional Statements Re: Participation in Classes",
      body: "I, [STUDENT_NAME], understand that upon entering any public building, there are risks, and I will not hold Iyengar Yoga St. Petersburg liable for any harm or injury obtained to me in or around the perimeters by any type of scenario within or outside the class I am attending.\n\nI, [STUDENT_NAME], understand that Iyengar Yoga St. Petersburg is a public facility in which airborne viruses may be present. I agree that I will not hold the Yoga Studio liable for any illness which may be contracted by visiting a public facility and being in proximity with others, and for any allergic reactions to airborne remnants of cleaner within the studio.\n\nI, [STUDENT_NAME], understand that both Iyengar Yoga St. Petersburg and its affiliated instructors are not diagnosing, prescribing or treating. I agree to consult a doctor or medical professional about a state of pathology, dysfunction, or pain, and to advise my instructors about such concerns. I understand that prior to beginning any exercise routine, I, [STUDENT_NAME], should consult with a medical professional. I also understand I am responsible for the security of my belongings and should keep any valuables with me at all times or should not bring them into the studio.",
    },
    {
      heading: "Acknowledgement",
      body: "I, [STUDENT_NAME], acknowledge that I have read this release, I understand it, and I am aware that engaging in the activities and instruction offered by the Iyengar Yoga St. Petersburg may involve activities that have physical risks, and I am fully aware of the legal consequences of signing this release.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Generate PDF in memory → return Buffer (no local file write)
// ---------------------------------------------------------------------------
function generateWaiverPdf({ studentName, studentEmail, ip, signatureBase64, signedAt }) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDoc({ margin: 50 });
    const chunks = [];

    doc.on("data",  chunk => chunks.push(chunk));
    doc.on("end",   ()    => resolve(Buffer.concat(chunks)));
    doc.on("error", err   => reject(err));

    // Header
    doc.fontSize(18).font("Helvetica-Bold").text("Liability Waiver", { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Iyengar Yoga St. Petersburg", { align: "center" });
    doc.moveDown();

    // Student details
    doc.fontSize(10).text(`Name:      ${studentName}`);
    doc.text(`Email:     ${studentEmail}`);
    doc.text(`Signed:    ${new Date(signedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
    doc.text(`IP:        ${ip}`);
    doc.moveDown();

    // Waiver sections with name substituted
    const sections = waiverText().map(s => ({
      heading: s.heading,
      body:    s.body.replaceAll("[STUDENT_NAME]", studentName),
    }));

    sections.forEach(section => {
      doc.fontSize(11).font("Helvetica-Bold").text(section.heading);
      doc.fontSize(10).font("Helvetica").text(section.body, { align: "justify" });
      doc.moveDown();
    });

    // Signature image
    if (signatureBase64) {
      doc.fontSize(11).font("Helvetica-Bold").text("Signature:");
      doc.moveDown(0.5);
      try {
        const imgBuffer = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        doc.image(imgBuffer, { width: 250 });
      } catch {
        doc.fontSize(10).font("Helvetica").text("[Signature image could not be rendered]");
      }
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// GET /api/waiver/text — raw sections for frontend live replacement
// ---------------------------------------------------------------------------
router.get("/text", async (req, res) => {
  res.json({ sections: waiverText() });
});

// ---------------------------------------------------------------------------
// GET /api/waiver/status?email= — check if student has signed
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email required" });

  const student = await Student.findOne({ email: email.toLowerCase().trim() });
  if (!student || !student.waiverSigned) {
    return res.json({ signed: false });
  }
  // NOTE: never include admin-tokened URLs here — this endpoint is public.
  // The admin UI builds the /waiver/pdf URL itself with its own credentials.
  res.json({
    signed:   true,
    signedAt: student.waiverSignedAt,
    name:     student.name,
  });
});

// ---------------------------------------------------------------------------
// POST /api/waiver/sign — sign waiver, generate PDF, upload to S3
// ---------------------------------------------------------------------------
router.post("/sign", async (req, res) => {
  const { name, email, signature } = req.body;
  if (!name || !email || !signature) {
    return res.status(400).json({ error: "name, email, and signature are required" });
  }

  const ip       = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const signedAt = new Date();

  try {
    // 1. Generate PDF in memory
    const pdfBuffer = await generateWaiverPdf({
      studentName:    name,
      studentEmail:   email,
      ip,
      signatureBase64: signature,
      signedAt,
    });

    // 1b. Block signing under an email registered to a different student
    const existing = await Student.findOne({ email: email.toLowerCase().trim() }, { name: 1 });
    if (existing && existing.name && existing.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      console.warn("✗ Waiver blocked: name mismatch for", email, "— on file:", existing.name, "— submitted:", name);
      return res.status(409).json({ error: "This email is registered to another student. Please use your own email address, or contact info@iy-sp.com." });
    }

    // 2. Upload to S3
    const dateStr = signedAt.toISOString().slice(0, 10);                     // YYYY-MM-DD
    const safeEmail = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
    const s3Key   = `waivers/${dateStr}_${safeEmail}.pdf`;

   try {
  await uploadToS3(pdfBuffer, s3Key);
  console.log("✓ S3 upload complete:", s3Key);
} catch (s3Err) {
  console.error("✗ S3 upload failed:", s3Err.message);
}

    // 3. Upsert student record — store S3 key in waiverPdfPath
    await Student.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          name,
          waiverSigned:    true,
          waiverSignedAt:  signedAt,
          waiverIp:        ip,
          waiverSignature: signature,
          waiverPdfPath:   s3Key,         // S3 key, not a local path
        },
      },
      { upsert: true, new: true }
    );

    // 4. Send confirmation email with PDF attached
    console.log('pdfBuffer type:', typeof pdfBuffer, 'size:', pdfBuffer?.length);
    await sendWaiverEmail({ name, email, pdfBuffer });

    res.json({ success: true });

  } catch (err) {
    console.error("Waiver sign error:", err);
    res.status(500).json({ error: "Failed to save waiver" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/waiver/pdf/:email — admin: redirect to signed S3 URL (admin only)
// ---------------------------------------------------------------------------
router.get("/pdf/:email", adminAuth, async (req, res) => {
  const student = await Student.findOne({ email: req.params.email.toLowerCase() });
  if (!student || !student.waiverPdfPath) {
    return res.status(404).json({ error: "No waiver found for this student" });
  }

  try {
    const signedUrl = await getWaiverUrl(student.waiverPdfPath);
    res.redirect(signedUrl);
  } catch (err) {
    console.error("S3 URL error:", err);
    res.status(500).json({ error: "Could not retrieve waiver" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/waiver/unsigned — admin: list students without a signed waiver
// ---------------------------------------------------------------------------
router.get("/unsigned", adminAuth, async (req, res) => {
  const unsigned = await Student.find(
    { $or: [{ waiverSigned: false }, { waiverSigned: null }, { waiverSigned: { $exists: false } }] },
    { name: 1, email: 1, createdAt: 1 }
  ).sort({ createdAt: -1 });

  res.json({ unsigned });
});

// ---------------------------------------------------------------------------
// POST /api/waiver/send-pdf — admin: email waiver PDF to a recipient
// ---------------------------------------------------------------------------
router.post("/send-pdf", adminAuth, async (req, res) => {
  const { email, recipientEmail } = req.body;
  if (!email || !recipientEmail) return res.status(400).json({ error: "email and recipientEmail required" });

  try {
    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student || !student.waiverSigned) return res.status(404).json({ error: "No waiver found" });

    // Get PDF buffer from S3
    const s3Key = student.waiverPdfPath;
    const pdfBuffer = await getWaiverBuffer(s3Key);

    await sendWaiverEmail({
      name:       student.name,
      email:      recipientEmail,
      pdfBuffer,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("send-pdf error:", err);
    res.status(500).json({ error: "Failed to send waiver email" });
  }
});

module.exports = router;