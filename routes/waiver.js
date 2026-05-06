// server/routes/waiver.js
const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const PDFDocument = require("pdfkit");
const Student  = require("../models/Student");
const adminAuth = require("../middleware/auth");

const { sendWaiverEmail } = require("../email");

// ── Waiver text ───────────────────────────────────────────
// Studio name placeholder — in Studioflow this will be per-studio config
const STUDIO_NAME   = process.env.STUDIO_NAME   || "Iyengar Yoga St. Petersburg";
const STUDIO_COUNTY = process.env.STUDIO_COUNTY || "Pinellas";
const STUDIO_STATE  = process.env.STUDIO_STATE  || "Florida";

function waiverText() {
  return [
    {
      heading: null,
      body: `For and in consideration of permitting me to enroll and participate in the ${STUDIO_NAME} online and/or live classes and the activities and instruction given and conducted by the ${STUDIO_NAME}, in the County of ${STUDIO_COUNTY}, State of ${STUDIO_STATE}.`,
    },
    {
      heading: "Release of Liability",
      body: `I, [STUDENT_NAME], voluntarily release, discharge, waive, and relinquish all claims of liability against the ${STUDIO_NAME} including but not limited to any and all actions or causes of action for personal injury, death, or property damage occurring to me as a result of engaging or receiving instruction online or in person at the ${STUDIO_NAME} studio, in any activities or instruction incidental thereto or merely as the result of being enrolled at the ${STUDIO_NAME}, wherever or however any such injury, death, or property damage may occur, whether by the negligence of the ${STUDIO_NAME} or any of its officers, agents, servants or employees, or otherwise, and for the entire period that I am enrolled at ${STUDIO_NAME} or participating in activities or instruction online or at the studio at the ${STUDIO_NAME}.`,
    },
    {
      heading: "Assumption of Risk",
      body: `I, [STUDENT_NAME], assume full responsibility for all risk of bodily injury, death, or property damage caused by the negligence of the ${STUDIO_NAME}, or any of the ${STUDIO_NAME} officers, agents, servants or employees, or otherwise, while enrolled at the ${STUDIO_NAME} or engaged in any activity or instruction with the ${STUDIO_NAME}. I for myself, and my heirs, executors, administrators, personal representatives, and assigns release, waive, discharge, and relinquish any action or cause of action for personal injury, death, or property damage that may arise from being enrolled at the ${STUDIO_NAME} or participating in any instruction or activities conducted by the ${STUDIO_NAME} — online or in the studio, and agrees that under no circumstances will I prosecute or present any claim for personal injury, death, or property damage against the ${STUDIO_NAME} or any of the ${STUDIO_NAME} officers, agents, servants or employees for personal injury, death or property damage arising from enrollment at the ${STUDIO_NAME} or from participating in any activities or instruction conducted by the ${STUDIO_NAME}, whether such personal injury, death, or property damage be caused by the negligence of the ${STUDIO_NAME} or any of the ${STUDIO_NAME} officers, agents, servants or employees.`,
    },
    {
      heading: "Indemnification",
      body: `I, [STUDENT_NAME], for myself and my heirs, executors, administrators, personal representatives, and assigns agree that in the event that any claim for personal injury, death, or property damage shall be prosecuted against the ${STUDIO_NAME} on behalf of the student or his or her heirs, executors, administrators, personal representatives and assigns, I shall indemnify and save harmless the ${STUDIO_NAME} from any and all such claims or causes of action by whomever made and wherever and whenever.`,
    },
    {
      heading: "Additional Statements Re: Participation in Classes",
      body: `I, [STUDENT_NAME], understand that upon entering any public building, there are risks, and I will not hold ${STUDIO_NAME} liable for any harm or injury obtained to me in or around the perimeters by any type of scenario within or outside the class I am attending.\n\nI, [STUDENT_NAME], understand that ${STUDIO_NAME} is a public facility in which airborne viruses may be present. I agree that I will not hold the Yoga Studio liable for any illness which may be contracted by visiting a public facility and being in proximity with others, and for any allergic reactions to airborne remnants of cleaner within the studio.\n\nI, [STUDENT_NAME], understand that both ${STUDIO_NAME} and its affiliated instructors are not diagnosing, prescribing or treating. I agree to consult a doctor or medical professional about a state of pathology, dysfunction, or pain, and to advise my instructors about such concerns. I understand that prior to beginning any exercise routine, I, [STUDENT_NAME], should consult with a medical professional. I also understand I am responsible for the security of my belongings and should keep any valuables with me at all times or should not bring them into the studio.`,
    },
    {
      heading: "Acknowledgement",
      body: `I, [STUDENT_NAME], acknowledge that I have read this release, I understand it, and I am aware that engaging in the activities and instruction offered by the ${STUDIO_NAME} may involve activities that have physical risks, and I am fully aware of the legal consequences of signing this release.`,
    },
  ];
}

// ── PDF generator ─────────────────────────────────────────
async function generateWaiverPdf({ studentName, studentEmail, signatureDataUrl, ip, signedAt }) {
  return new Promise((resolve, reject) => {
    const dir = path.join(__dirname, "../waivers");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename    = `waiver_${studentEmail.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.pdf`;
    const filePath    = path.join(dir, filename);
    const doc         = new PDFDocument({ margin: 60, size: "LETTER" });
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    // Header
    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(STUDIO_NAME, { align: "center" })
      .moveDown(0.3)
      .fontSize(13)
      .font("Helvetica")
      .text("Liability Waiver & Release", { align: "center" })
      .moveDown(0.5);

    // Metadata
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(`Signed by: ${studentName} (${studentEmail})`, { align: "left" })
      .text(`Date: ${new Date(signedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`)
      .text(`IP address: ${ip}`)
      .moveDown(1)
      .fillColor("#000");

    // Waiver sections — replace [STUDENT_NAME] token with the actual name
    const sections = waiverText().map(s => ({
      heading: s.heading,
      body: s.body.replaceAll("[STUDENT_NAME]", studentName),
    }));

    for (const section of sections) {
      if (section.heading) {
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text(section.heading)
          .moveDown(0.3);
      }
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(section.body, { align: "justify", lineGap: 2 })
        .moveDown(0.75);
    }

    // Signature
    doc
      .moveDown(0.5)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("Signature:")
      .moveDown(0.5);

    if (signatureDataUrl) {
      try {
        const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
        const imgBuffer  = Buffer.from(base64Data, "base64");
        doc.image(imgBuffer, { width: 200, height: 80 });
      } catch (e) {
        doc.text("[Signature on file]");
      }
    }

    doc
      .moveDown(0.5)
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#666")
      .text(`Electronically signed · ${new Date(signedAt).toISOString()}`);

    doc.end();

    writeStream.on("finish", () => resolve(filePath));
    writeStream.on("error", reject);
  });
}

// ═══════════════════════════════════════════════════════════
// GET /api/waiver/status?email=
// Returns waiverSigned status for a student — used by booking modal
// ═══════════════════════════════════════════════════════════
router.get("/status", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required." });

    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student) return res.json({ waiverSigned: false, studentFound: false });

    res.json({
      waiverSigned:   student.waiverSigned,
      waiverSignedAt: student.waiverSignedAt,
      studentFound:   true,
      studentName:    student.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/waiver/text?name=
// Returns waiver sections with student name interpolated
// ═══════════════════════════════════════════════════════════
router.get("/text", (req, res) => {
  res.json({ sections: waiverText(), studioName: STUDIO_NAME });
});
// ═══════════════════════════════════════════════════════════
// POST /api/waiver/sign
// Save signature, generate PDF, send emails
// ═══════════════════════════════════════════════════════════
router.post("/sign", async (req, res) => {
  try {
    const { email, name, signature } = req.body;
    if (!email || !name || !signature) {
      return res.status(400).json({ error: "Email, name, and signature are required." });
    }

    const ip       = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const signedAt = new Date();

    // Upsert student — create if they don't exist yet (e.g. signing before booking)
    let student = await Student.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
      $setOnInsert: { email: email.toLowerCase().trim() },
      $set: {
        name,
        waiverSigned:    true,
        waiverSignedAt:  signedAt,
        waiverIp:        ip,
        waiverSignature: signature,
      },
    },
      { new: true, upsert: true }
    );

    // Generate PDF
    let pdfPath = null;
    try {
      pdfPath = await generateWaiverPdf({
        studentName:      student.name,
        studentEmail:     student.email,
        signatureDataUrl: signature,
        ip,
        signedAt,
      });
      await Student.findByIdAndUpdate(student._id, { waiverPdfPath: pdfPath });
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr.message);
      // Non-fatal — waiver is still saved, just no PDF
    }

    // Send email to student
    try {
      await sendWaiverEmail({
        studentName:  student.name,
        studentEmail: student.email,
        signedAt,
        pdfPath,
      });
    } catch (emailErr) {
      console.error("Waiver email failed:", emailErr.message);
    }

    res.json({
      success:        true,
      waiverSigned:   true,
      waiverSignedAt: signedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/waiver/pdf/:email  (admin)
// Returns the PDF as a download
// ═══════════════════════════════════════════════════════════
router.get("/pdf/:email", adminAuth, async (req, res) => {
  try {
    const student = await Student.findOne({ email: req.params.email.toLowerCase() });
    if (!student?.waiverPdfPath) return res.status(404).json({ error: "No waiver PDF found." });
    if (!fs.existsSync(student.waiverPdfPath)) return res.status(404).json({ error: "PDF file not found on server." });

    res.download(student.waiverPdfPath, path.basename(student.waiverPdfPath));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/waiver/unsigned  (admin)
// Returns students who haven't signed
// ═══════════════════════════════════════════════════════════
router.get("/unsigned", adminAuth, async (req, res) => {
  try {
    const students = await Student.find({ waiverSigned: { $ne: true } })
      .select("name email firstVisit createdAt")
      .sort({ createdAt: -1 });
    res.json({ students, count: students.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
