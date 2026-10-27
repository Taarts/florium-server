const express = require('express');
const multer = require('multer');
const router = express.Router();

const Video = require('../models/Video');
const bunnyService = require('../services/bunnyService');
const adminAuth = require('../middleware/auth');
const { sendVideoLinkEmail } = require('../email');

const fs = require('fs');
const os = require('os');
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });
const Rental = require('../models/Rental');
const Pass = require('../models/Pass');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const RENTAL_PRICE_CENTS = 1500; // $15 / 48hr
const RENTAL_WINDOW_HOURS = 48;
const Coupon = require('../models/Coupon');

const MEMBERSHIP_TYPES = ['member2x', 'memberUnl'];

// Automatic rental discount by membership (percent off).
// Monthly (memberUnl) isn't here — it has full access via findActiveVideoSub.
const MEMBER_RENTAL_PERCENT_OFF = { member2x: 25 };

async function findActiveMembership(email, types = MEMBERSHIP_TYPES) {
  return Pass.findOne({
    studentEmail: email,
    type: { $in: types },
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
}

// Rental codes must list 'video_rental' explicitly — "applies to all" pass codes don't count.
// Eligibility: no restrictions = anyone; otherwise email on the list OR an allowed active membership.
async function checkRentalCoupon(code, email) {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
  if (!coupon || !coupon.active) return { status: 404, error: 'Invalid or expired code.' };
  if (coupon.expiresAt && new Date() > coupon.expiresAt) return { status: 400, error: 'This code has expired.' };
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return { status: 400, error: 'This code has reached its usage limit.' };
  if (!coupon.appliesToTypes.includes('video_rental')) return { status: 400, error: 'This code does not apply to video rentals.' };

  const emails = coupon.allowedEmails || [];
  let memberships = coupon.allowedMemberships || [];
  if (!memberships.length && coupon.membersOnly) memberships = MEMBERSHIP_TYPES;
  if (emails.length || memberships.length) {
    const ok = emails.includes(email)
      || (memberships.length > 0 && !!(await findActiveMembership(email, memberships)));
    if (!ok) return { status: 400, error: "This code isn't valid for this email." };
  }
  return { coupon };
}

// Fixed coupons are stored in dollars. Under Stripe's 50¢ minimum → free.
function discountedCents(coupon, cents) {
  const off = coupon.type === 'percent'
    ? Math.round(cents * coupon.amount / 100)
    : Math.round(coupon.amount * 100);
  const final = Math.max(0, cents - off);
  return final > 0 && final < 50 ? 0 : final;
}

// Best price for this email: membership rate vs coupon (coupon only used if it beats the rate)
async function rentalPrice(email, coupon = null) {
  const membership = await findActiveMembership(email, Object.keys(MEMBER_RENTAL_PERCENT_OFF));
  const pct = membership ? MEMBER_RENTAL_PERCENT_OFF[membership.type] : 0;
  const baseCents = Math.round(RENTAL_PRICE_CENTS * (100 - pct) / 100);
  const couponCents = coupon ? discountedCents(coupon, RENTAL_PRICE_CENTS) : null;
  const useCoupon = couponCents !== null && couponCents < baseCents;
  return {
    baseCents,
    priceCents: useCoupon ? couponCents : baseCents,
    useCoupon,
    membershipType: membership ? membership.type : null,
  };
}

// Full video access: video subscribers + Monthly (memberUnl) members
async function findActiveVideoSub(email) {
  return Pass.findOne({
    studentEmail: email,
    type: { $in: ['videoSub', 'memberUnl'] },
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
}

router.get('/', async (req, res) => {
  try {
    const videos = await Video.find({ isPublished: true }).sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/rent-price?email=... — this email's rental price (membership rate applied)
router.get('/rent-price', async (req, res) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.json({ priceCents: RENTAL_PRICE_CENTS, membershipType: null });
    const p = await rentalPrice(email);
    res.json({ priceCents: p.priceCents, membershipType: p.membershipType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin', adminAuth, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/videos/init-upload — creates the Video doc + Bunny placeholder,
// returns signed TUS credentials for the frontend to upload directly to
// Bunny. No file bytes touch this server.
router.post('/init-upload', adminAuth, async (req, res) => {
  try {
    const { title, teacher, subject, source, classId, classDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const bunnyVideoId = await bunnyService.createVideoPlaceholder(title);
    const thumbnailUrl = bunnyService.getThumbnailUrl(bunnyVideoId);

    const video = await Video.create({
      title,
      teacher,
      subject,
      bunnyVideoId,
      thumbnailUrl,
      source: source === 'zoom_recording' ? 'zoom_recording' : 'direct_upload',
      isPublished: false,
      classId: classId || undefined,
      classDate: classDate || undefined,
    });

    const tusCredentials = bunnyService.getTusUploadCredentials(bunnyVideoId);

    res.json({ video, tusCredentials });
  } catch (err) {
    console.error('Video init-upload failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/videos/:id/upload-complete — frontend calls this once the
// TUS upload finishes, so we have a record of when the file actually landed.
router.patch('/:id/upload-complete', adminAuth, async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { uploadedAt: new Date() },
      { new: true }
    );
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', adminAuth, upload.single('video'), async (req, res) => {
  try {
    const { title, teacher, subject, source, classId, classDate } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const bunnyVideoId = await bunnyService.createAndUploadVideo(title, req.file.path);
    const thumbnailUrl = bunnyService.getThumbnailUrl(bunnyVideoId);

    fs.unlink(req.file.path, () => {});

    const video = await Video.create({
      title,
      teacher,
      subject,
      bunnyVideoId,
      thumbnailUrl,
      source: source === 'zoom_recording' ? 'zoom_recording' : 'direct_upload',
      isPublished: false,
      classId: classId || undefined,
      classDate: classDate || undefined,
    });

    res.json(video);
  } catch (err) {
    console.error('Video upload failed:', err.message);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});
// GET /api/videos/:id/roster — pulls confirmed student emails from the
// linked class + date, using the existing bookings roster logic
router.get('/:id/roster', adminAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!video.classId || !video.classDate) {
      return res.json({ emails: [] });
    }

    const Booking = require('../models/Booking');
    const bookings = await Booking.find({
      classId: video.classId,
      date: video.classDate,
      status: 'confirmed',
    });

    const emails = [...new Set(bookings.map((b) => b.studentEmail))];
    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/send', adminAuth, async (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const playbackUrl = bunnyService.getPlaybackUrl(video.bunnyVideoId);

    const results = await Promise.allSettled(
      emails.map((email) => sendVideoLinkEmail(email, video.title, playbackUrl))
    );

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? emails[i] : null))
      .filter(Boolean);

    res.json({ sent: emails.length - failed.length, failed });
  } catch (err) {
    console.error('Video send failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/:id/rent-quote — preview a rental code (membership checked)
router.post('/:id/rent-quote', async (req, res) => {
  try {
    const { email, couponCode } = req.body;
    if (!couponCode) return res.status(400).json({ valid: false, error: 'Code required' });
    if (!email) return res.status(400).json({ valid: false, error: 'Email required' });
    const cleanEmail = email.toLowerCase().trim();
    const result = await checkRentalCoupon(couponCode, cleanEmail);
    if (result.error) return res.status(result.status).json({ valid: false, error: result.error });
    const p = await rentalPrice(cleanEmail, result.coupon);
    res.json({
      valid: true,
      code: result.coupon.code,
      originalCents: p.baseCents,
      priceCents: p.priceCents,
      couponBetter: p.useCoupon,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/rent', async (req, res) => {
  try {
    const { email, couponCode } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const video = await Video.findById(req.params.id);
    if (!video || !video.isPublished) return res.status(404).json({ error: 'Video not found' });

    const cleanEmail = email.toLowerCase().trim();

    // Active subscriber — skip Checkout entirely, hand back the play URL
    const sub = await findActiveVideoSub(cleanEmail);
    if (sub) {
      return res.json({
        alreadyIncluded: true,
        url: bunnyService.getPlaybackUrl(video.bunnyVideoId),
      });
    }

    // Membership rate applies automatically; a code is only used if it beats it
    let coupon = null;
    if (couponCode && String(couponCode).trim()) {
      const result = await checkRentalCoupon(couponCode, cleanEmail);
      if (result.error) return res.status(result.status).json({ error: result.error });
      coupon = result.coupon;
    }
    const pricing = await rentalPrice(cleanEmail, coupon);
    if (!pricing.useCoupon) coupon = null;
    const priceCents = pricing.priceCents;

    // Free with code — skip Stripe, redeem atomically (enforces maxUses)
    if (coupon && priceCents === 0) {
      const redeemed = await Coupon.findOneAndUpdate(
        { _id: coupon._id, active: true,
          $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
        { $inc: { usedCount: 1 } },
        { new: true }
      );
      if (!redeemed) return res.status(400).json({ error: 'This code has reached its usage limit.' });

      const expiresAt = new Date(Date.now() + RENTAL_WINDOW_HOURS * 60 * 60 * 1000);
      await Rental.create({
        video: video._id,
        studentEmail: cleanEmail,
        stripePaymentIntentId: `coupon_${coupon.code}_${Date.now()}`,
        amount: 0,
        expiresAt,
        couponCode: coupon.code,
      });

      const url = bunnyService.getPlaybackUrl(video.bunnyVideoId);
      try {
        const { sendVideoLinkEmail } = require('../email');
        await sendVideoLinkEmail(cleanEmail, video.title, url);
      } catch (e) {
        console.warn(`✗ free rental email failed for ${cleanEmail}: ${e.message}`);
      }
      console.log(`✓ Free rental via ${coupon.code} for ${cleanEmail} — video ${video._id}`);
      return res.json({ alreadyIncluded: true, freeWithCode: true, url, expiresAt });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: cleanEmail,
      allow_promotion_codes: false, // Florium codes are applied in the app, not on Stripe's page
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `48-hour rental: ${video.title}` },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      metadata: {
        studio: require('../config/studio').STUDIO_ID,
        type: 'video_rental',
        videoId: video._id.toString(),
        studentEmail: cleanEmail,
        ...(coupon ? { couponCode: coupon.code } : {}),
      },
      success_url: `${require('../config/studio').SITE_URL}/videos/${video._id}?rented=1`,
      cancel_url: `${require('../config/studio').SITE_URL}/videos/${video._id}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Video rent failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/:id/play?email=... — gated playback URL
router.get('/:id/play', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const cleanEmail = email.toLowerCase().trim();

    const sub = await findActiveVideoSub(cleanEmail);
    if (sub) {
      return res.json({ url: bunnyService.getPlaybackUrl(video.bunnyVideoId), access: 'subscription' });
    }

    const rental = await Rental.findOne({
      video: video._id,
      studentEmail: cleanEmail,
      expiresAt: { $gt: new Date() },
    });
    if (!rental) {
      return res.status(403).json({ error: 'No active rental or subscription for this video.' });
    }

    res.json({ url: bunnyService.getPlaybackUrl(video.bunnyVideoId), access: 'rental', expiresAt: rental.expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// DELETE /api/videos/:id — removes the video from Bunny Stream and Mongo together
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    try {
      await bunnyService.deleteVideo(video.bunnyVideoId);
    } catch (bunnyErr) {
      // Bunny returns 404 if the video's already gone there — safe to ignore
      // and still clean up the Mongo record. Any other error, surface it.
      if (bunnyErr.response?.status !== 404) throw bunnyErr;
    }

    await Video.findByIdAndDelete(req.params.id);

    res.json({ deleted: true });
  } catch (err) {
    console.error('Video delete failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// PATCH /api/videos/:id/publish — toggles a video's public visibility
router.patch('/:id/publish', adminAuth, async (req, res) => {
  try {
    const { isPublished } = req.body;
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({ error: 'isPublished (boolean) is required' });
    }

    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { isPublished },
      { new: true }
    );
    if (!video) return res.status(404).json({ error: 'Video not found' });

    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set or clear the recording date (classDate, YYYY-MM-DD) for a video
router.patch('/:id/date', adminAuth, async (req, res) => {
  try {
    const { classDate } = req.body;
    if (classDate && !/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
      return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    }
    const update = classDate ? { $set: { classDate } } : { $unset: { classDate: 1 } };
    const video = await Video.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;