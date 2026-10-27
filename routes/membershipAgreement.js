const express  = require('express');
const router   = express.Router();
const PDFDoc   = require('pdfkit');
const fs       = require('fs');
const path     = require('path');
const MembershipAgreement = require('../models/MembershipAgreement');
const { uploadToS3, getWaiverUrl } = require('../s3');
const { sendMembershipAgreementEmail } = require('../email');
const adminAuth = require('../middleware/auth');
const { STUDIO_ID, STUDIOS, resolveStudio, agreementNames } = require('../config/studio');

const STUDIO_SIG_PATH = path.join(__dirname, '..', 'tricia-signature.png');

// From config/pricing.js (per-deployment). fee = card fee charged on top of the advertised rate.
const MEMBERSHIP_DETAILS = Object.fromEntries(
  Object.entries(require('../config/pricing').memberships).map(([k, m]) => [k, {
    label:       m.agreementLabel,
    description: m.agreementDescription,
    price:       m.display.toFixed(2),
    fee:         m.actualCharge > m.display,
  }])
);

function agreementSections(studentName, membershipType, studio) {
  const m = MEMBERSHIP_DETAILS[membershipType];
  const studioName = agreementNames(studio).name;
  return [
    {
      heading: '',
      body: `This monthly membership agreement between ${studentName} and ${studioName}.\n\nThe Studio offers a monthly membership that ${m.description}. This monthly pass requires a minimum commitment of 3 months at the monthly rate of $${m.price} per month${m.fee ? ' plus Stripe processing fee' : ''}.`,
    },
    {
      heading: 'Authorization for Card Autopay',
      body: `I authorize ${studioName} to charge my card on file for services, fees, and other authorized charges. I understand that:\n\n• Membership charges are drawn on or about the same day each month. Other charges will be assessed as they are incurred.\n\n• The Monthly Pass will automatically renew each month at the 3-month rate described above. After 3 months, the agreement may be canceled with 15-day written notice to the studio. If the agreement is not cancelled, I agree to continue the autopay month-to-month.\n\n• A $25 service fee will be assessed for returned charges stemming from an expired or changed card or any other payment-related reason.`,
    },
    {
      heading: 'Hold Policy',
      body: 'I understand I may put my membership on hold for a period of up to 2 weeks within a 3-month term of this agreement. To do so, I will email a request to the studio no more than 14 days before the requested hold is due to commence.\n\nI understand that if I experience a medical condition for which yoga is contraindicated, I can put my pass on hold indefinitely. To request this hold, I need a written note from my medical doctor. A note from a chiropractor or massage therapist is not sufficient.',
    },
    {
      heading: 'Right to Cancel',
      body: 'I understand that I may cancel this contract by filling out the cancellation form available at the studio and paying a $250 cancellation fee. If I relocate more than 25 miles from ' + studioName + ', I may cancel this agreement by providing 30-day written notice, proof of relocation, and a reduced cancellation fee of $50.',
    },
  ];
}

function generateAgreementPdf({ studentName, studentEmail, membershipType, ip, signatureBase64, signedAt, studio }) {
  return new Promise((resolve, reject) => {
    const m      = MEMBERSHIP_DETAILS[membershipType];
    const names  = agreementNames(studio);
    const doc    = new PDFDoc({ margin: 50 });
    const chunks = [];

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    doc.fontSize(18).font('Helvetica-Bold').text('Membership Agreement', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text(names.header, { align: 'center' });
    doc.moveDown();

    doc.fontSize(10).text('Name:    ' + studentName);
    doc.text('Email:   ' + studentEmail);
    doc.text('Plan:    ' + m.label + ' — $' + m.price + '/mo + processing fee');
    doc.text('Signed:  ' + new Date(signedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    doc.text('IP:      ' + ip);
    doc.moveDown();

    agreementSections(studentName, membershipType, studio).forEach(section => {
      if (section.heading) {
        doc.fontSize(11).font('Helvetica-Bold').text(section.heading);
      }
      doc.fontSize(10).font('Helvetica').text(section.body, { align: 'justify' });
      doc.moveDown();
    });

    doc.fontSize(11).font('Helvetica-Bold').text('By Student:');
    doc.moveDown(0.5);
    if (signatureBase64) {
      try {
        const imgBuffer = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        doc.image(imgBuffer, { width: 200 });
      } catch {
        doc.fontSize(10).font('Helvetica').text('[Signature image could not be rendered]');
      }
    }
    doc.fontSize(10).font('Helvetica').text('Print: ' + studentName);
    doc.text('Date:  ' + new Date(signedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' }));
    doc.moveDown(1.5);

    doc.fontSize(11).font('Helvetica-Bold').text(`By ${names.name}:`);
    doc.moveDown(0.5);
    try {
      const studioSig = fs.readFileSync(STUDIO_SIG_PATH);
      doc.image(studioSig, { width: 200 });
    } catch {
      doc.fontSize(10).font('Helvetica').text('[Studio signature]');
    }
    doc.fontSize(10).font('Helvetica').text('Print: Tricia Amheiser');
    doc.text('Date:  ' + new Date(signedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' }));

    doc.end();
  });
}

router.get('/text', (req, res) => {
  const { type } = req.query;
  if (!MEMBERSHIP_DETAILS[type]) return res.status(400).json({ error: 'Invalid membership type' });
  const studio = resolveStudio(req.query.studio);
  res.json({ sections: agreementSections('[STUDENT_NAME]', type, studio), details: MEMBERSHIP_DETAILS[type], studioName: agreementNames(studio).header });
});

router.get('/status', async (req, res) => {
  const { email, type } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const query = { studentEmail: email.toLowerCase().trim() };
  if (type) query.membershipType = type;
  // An agreement is with one studio. Records from before `studio` was stored belong to this server's own studio.
  const studio = resolveStudio(req.query.studio);
  if (studio === STUDIO_ID) query.$or = [{ studio }, { studio: { $exists: false } }];
  else query.studio = studio;
  const agreement = await MembershipAgreement.findOne(query).sort({ signedAt: -1 });
  if (!agreement) return res.json({ signed: false });
  res.json({ signed: true, signedAt: agreement.signedAt, membershipType: agreement.membershipType });
});

router.post('/sign', async (req, res) => {
  const { name, email, membershipType, signature } = req.body;
  if (!name || !email || !membershipType || !signature) {
    return res.status(400).json({ error: 'name, email, membershipType, and signature are required' });
  }
  if (!MEMBERSHIP_DETAILS[membershipType]) {
    return res.status(400).json({ error: 'Invalid membership type' });
  }
  if (req.body.studio && !STUDIOS.includes(req.body.studio)) {
    return res.status(400).json({ error: 'Invalid studio' });
  }
  const studio = resolveStudio(req.body.studio);

  const ip       = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const signedAt = new Date();
  const m        = MEMBERSHIP_DETAILS[membershipType];

  try {
    const pdfBuffer = await generateAgreementPdf({
      studentName:    name,
      studentEmail:   email,
      membershipType,
      ip,
      signatureBase64: signature,
      signedAt,
      studio,
    });

    const dateStr   = signedAt.toISOString().slice(0, 10);
    const safeEmail = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
    const s3Key     = `membership-agreements/${dateStr}_${safeEmail}_${membershipType}${studio === STUDIO_ID ? '' : '_' + studio}.pdf`;

    try {
      await uploadToS3(pdfBuffer, s3Key);
      console.log('✓ Agreement S3 upload:', s3Key);
    } catch (s3Err) {
      console.error('✗ Agreement S3 upload failed:', s3Err.message);
    }

    await MembershipAgreement.create({
      studentName:      name,
      studentEmail:     email.toLowerCase().trim(),
      membershipType,
      studio,
      monthlyPrice:     parseFloat(m.price),
      signedAt,
      ip,
      studentSignature: signature,
      pdfS3Key:         s3Key,
    });

    try {
      await sendMembershipAgreementEmail({ name, email, membershipType, pdfBuffer, studioName: agreementNames(studio).header });
    } catch (mailErr) {
      console.error('✗ Agreement email failed:', mailErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Agreement sign error:', err);
    res.status(500).json({ error: 'Failed to save agreement' });
  }
});

router.get('/pdf/:email', adminAuth, async (req, res) => {
  const agreement = await MembershipAgreement.findOne({
    studentEmail: req.params.email.toLowerCase(),
  }).sort({ signedAt: -1 });

  if (!agreement || !agreement.pdfS3Key) {
    return res.status(404).json({ error: 'No agreement found' });
  }

  try {
    const signedUrl = await getWaiverUrl(agreement.pdfS3Key);
    res.redirect(signedUrl);
  } catch (err) {
    console.error('S3 URL error:', err);
    res.status(500).json({ error: 'Could not retrieve agreement' });
  }
});

module.exports = router;
