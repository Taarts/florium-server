const { BrevoClient } = require("@getbrevo/brevo");
const brevoClient = require("./lib/brevoClient");
const { bookingConfirmationHtml }  = require("./emails/bookingConfirmation");
const { workshopConfirmationHtml } = require("./emails/workshopConfirmation");
const { privatePassPromptHtml } = require('./emails/privatePassPrompt')
const FROM_NAME  = process.env.FROM_NAME  || "Iyengar Yoga St. Petersburg";
const FROM_EMAIL = process.env.FROM_EMAIL || "info@iy-sp.com";
const FROM_ADDRESS = `${FROM_NAME} <${FROM_EMAIL}>`; // legacy ref
const MAIL_CONTACT = process.env.STUDIO_EMAIL || "info@iy-sp.com"; // shown in email footers
const MAIL_BCC     = process.env.STUDIO_BCC   || "info@iy-sp.com";
const MAIL_CC      = process.env.STUDIO_CC    || "info@iy-sp.com";
const MAIL_BANNER  = process.env.STUDIO_BANNER || "Iyengar Yoga · St. Petersburg";
const s = require("./emails/emailStyles");
const ZOOM_LINK = process.env.ZOOM_LINK;
 
// ── Class details lookup ───────────────────────────────────
// Mirrors recurringClasses from data.js — single source of truth
// TODO: once classes are stored in MongoDB, fetch from DB instead

const { passReminderHtml } = require('./emails/passReminder');
const { welcomeEmailHtml } = require('./emails/welcomeEmail');

async function sendPassReminderEmail({ studentEmail, studentName, passType, classesRemaining, expiresAt }) {
  const html = passReminderHtml({ studentName, passType, classesRemaining, expiresAt });
  await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: studentEmail }], subject: 'Your pass — time to top up', htmlContent: html });
}
async function sendWaiverEmail({ name, email, pdfBuffer }) {
  const base64Pdf = pdfBuffer.toString("base64");
  try {
    const result = await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: email }],
      bcc: [{ email: MAIL_BCC }],
      subject: "Your liability waiver — Iyengar Yoga St. Pete",
      htmlContent: "<p>Please find your signed waiver attached.</p>",
      attachment: [{ content: base64Pdf, name: "waiver.pdf" }],
    });
    console.log("✓ Waiver email sent to", email, result);
  } catch (err) {
    console.error("✗ Waiver email failed:", err.message);
  }
}

const CLASS_DETAILS = {
  cls_mon: { title: "Iyengar Yoga",          day: "Monday",    time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_wed: { title: "Iyengar Yoga",          day: "Wednesday", time: "6:00 PM",  duration: 75, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_fri: { title: "Iyengar Yoga",          day: "Friday",    time: "10:00 AM", duration: 90, venue: "Soley Massage and Wellness, 2963 46th Ave N, St Petersburg, FL,33714", online: false },
  cls_sat: { title: "Iyengar Yoga — Online", day: "Saturday",  time: "8:15 AM",  duration: 90, online: true },
  cls_sun: { title: "Iyengar Yoga — Online", day: "Sunday",    time: "10:00 AM", duration: 90, online: true },
};
 
const REPLY_TO    = process.env.REPLY_TO || "info@iy-sp.com";
const PRICING_URL = "https://iy-sp.com/pricing";
const MY_BOOKINGS = "https://iy-sp.com/my-bookings";
 
// ── Shared HTML helpers ────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
}
 
function formatPaymentType(type) {
  const labels = {
    dropin:    "Drop-in",
    pass4:     "4-Class Pass",
    pass8:     "8-Class Pass",
    member2x:  "Membership — 2×/week",
    memberUnl: "Monthly",
    teacher:   "Teacher (free)",
  };
  return labels[type] || type;
}
 
// Shared outer wrapper — keeps all emails visually consistent
function emailShell(headerHtml, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0; padding:0; background:${s.colorBgPage}; font-family:${s.fontFamily};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${s.colorBgPage}; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px; background:${s.colorBgWhite}; border-radius:12px;
               box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="background:${s.colorBgLight}; padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid ${s.colorBorder};">
              <div style="display:inline-block; padding:8px 20px; border:1px solid ${s.colorBorder};
                           border-radius:6px; color:${s.colorPrimary}; font-size:13px; letter-spacing:0.08em;
                           text-transform:uppercase;">Iyengar Yoga · St. Petersburg</div>
            </td>
          </tr>
          ${headerHtml}
          <tr>
            <td style="padding:32px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px; background:${s.colorBgLight}; text-align:center;
                        border-top:1px solid ${s.colorBorder};">
              <p style="margin:0 0 4px; font-size:12px; color:${s.colorTextMuted};">Iyengar Yoga St. Petersburg</p>
              <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
                <a href="${PRICING_URL}" style="color:${s.colorPrimary}; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bannerHtml(label, heading) {
  return `
  <tr>
    <td style="background:${s.colorPrimary}; padding:24px 40px; text-align:center;">
      <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                 letter-spacing:0.14em; text-transform:uppercase;">${label}</p>
      <h1 style="margin:8px 0 0; color:${s.colorTextWhite}; font-size:26px; font-weight:300;
                  letter-spacing:0.03em;">${heading}</h1>
    </td>
  </tr>`;
}

function classDetailRows(cls, formattedDate, extraRows = "") {
  const locationRow = cls.venue === "venue_online"
    ? `<tr style="border-top:1px solid ${s.colorBorderLight};">
         <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Location</td>
         <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">Online via Zoom</td>
       </tr>
       <tr style="background:${s.colorBgLight}; border-top:1px solid ${s.colorBorderLight};">
         <td colspan="2" style="padding:12px 20px;">
           <a href="${ZOOM_LINK}"
             style="display:inline-block; background:${s.colorPrimary}; color:white; padding:10px 24px;
                    border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
             Join Zoom Class →
           </a>
         </td>
       </tr>`
    : `<tr style="border-top:1px solid ${s.colorBorderLight};">
         <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Location</td>
         <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${cls.venue}</td>
       </tr>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
    <tr style="background:${s.colorBgLight};">
      <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
          color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Class Details</td>
    </tr>
    <tr style="border-top:1px solid ${s.colorBorder};">
      <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Class</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">${cls.title}</td>
    </tr>
    <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
      <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Date</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${formattedDate}</td>
    </tr>
    <tr style="border-top:1px solid ${s.colorBorderLight};">
      <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Time</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${cls.time} · ${cls.duration} min</td>
    </tr>
    ${locationRow}
    ${extraRows}
  </table>`;
}
 
// ── Booking confirmation ───────────────────────────────────
async function sendBookingConfirmation({ name, email, classId, date, paymentType, classesRemaining, bookingId, cls: clsOverride }) {
let cls = clsOverride ?? await resolveClass(classId);
  if (cls) cls = { ...cls, isOnline: Boolean(cls.isOnline || cls.venue === "venue_online") };
  if (cls && cls.venueName) cls = { ...cls, venue: cls.venueName };
  if (cls && !cls.venueName && cls.venue && cls.venue !== "venue_online") {
    try {
      const Venue = require("./models/Venue");
      const v = await Venue.findOne({ id: cls.venue }).lean();
      if (v) cls = { ...cls, venue: v.address ? `${v.name}, ${v.address}` : v.name };
    } catch (e) { console.error("Venue lookup failed:", e.message); }
  }
  if (cls) cls = { ...cls, isHybrid: Boolean(cls.isHybrid || cls.hybrid) };

if (!cls) {
  console.error(`Unknown classId: ${classId}`);
  return;
}

const formattedDate = formatDate(date);
const html = bookingConfirmationHtml({
  name, cls, formattedDate, paymentType, classesRemaining, formatPaymentType, bookingId,
});

  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], replyTo: { email: REPLY_TO }, subject: `Booking confirmed -- ${cls.title}, ${formattedDate}`, htmlContent: html });
    console.log(`✓ Confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}
// ── Workshop confirmation ──────────────────────────────────
async function sendWorkshopConfirmationEmail({ name, email, workshopTitle, sessions, totalPrice, workshopId }) {
  const html = workshopConfirmationHtml({ name, workshopTitle, sessions, totalPrice, workshopId });
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Booking confirmed -- ${workshopTitle}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Workshop confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}

// ── Fetch class details from DB or fallback to hardcoded ──
async function resolveClass(classId) {
  // Handle private booking classIds: private__YYYY-MM-DD__HHmm
  if (classId.startsWith("private__")) {
  const parts = classId.split("__");
  const timeRaw = parts[2] ?? "";
  let time = "";
  if (timeRaw) {
    const h = parseInt(timeRaw.slice(0, 2), 10);
    const m = timeRaw.slice(2);
    const ampm = h >= 12 ? "pm" : "am";
    time = `${h % 12 || 12}:${m} ${ampm}`;
  }
  return { title: "Private Class", time, duration: 60, venue: "Other", online: false, hybrid: false };
}

  const Class = require("./models/Class");
  if (CLASS_DETAILS[classId]) return CLASS_DETAILS[classId];
  try {
    const dbClass = await Class.findOne({ id: classId });
    if (dbClass) return {
      title:    dbClass.title,
      time:     dbClass.time,
      duration: dbClass.duration,
      venue:    dbClass.venueName || dbClass.venue,
      online:   dbClass.venue === "venue_online",
      hybrid:   dbClass.hybrid ?? false,
    };
  } catch { /* silent */ }
  return null;
}

// ── Cancellation email ─────────────────────────────────────
// creditCode — present when admin cancelled a drop-in booking (class credit issued)
//            — null for pass holders (credit restored to pass) or student self-cancel
async function sendCancellationEmail({ name, email, classId, date, creditCode = null }) {
  const cls = await resolveClass(classId);
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:${s.colorBgLight};
                   border-left:3px solid ${s.colorCoral}; border-radius:0 6px 6px 0;">
         <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary};
                    letter-spacing:0.1em; text-transform:uppercase;">Your credit</p>
         <p style="margin:0 0 8px; font-size:13px; color:${s.colorTextBody}; line-height:1.6;">
           As this class was cancelled by the studio, we've issued you a 1-class credit pass.
           Use the code below when booking your next class.
         </p>
         <p style="margin:0; font-size:18px; font-weight:600; color:${s.colorPrimary};
                    letter-spacing:0.08em;">${creditCode}</p>
       </div>`
    : `<p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
         If you used a pass for this booking, your class credit has been restored.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your booking for
      <strong>${cls?.title ?? classId}</strong> on
      <strong>${formattedDate}</strong> has been cancelled.
    </p>
    ${creditBlock}
    <p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Book another class →
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Booking cancelled"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Booking cancelled — ${cls?.title ?? classId}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Cancellation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Cancellation email failed:", err.message);
  }
}

async function sendClassCancelledEmail({ name, email, classId, date, creditCode = null }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:${s.colorBgLight};
                   border-left:3px solid ${s.colorCoral}; border-radius:0 6px 6px 0;">
         <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary};
                    letter-spacing:0.1em; text-transform:uppercase;">Your credit pass</p>
         <p style="margin:0 0 8px; font-size:13px; color:${s.colorTextBody}; line-height:1.6;">
           We've issued you a 1-class credit to use toward any future class.
           Enter this code when booking:
         </p>
         <p style="margin:0; font-size:18px; font-weight:600; color:${s.colorPrimary};
                    letter-spacing:0.08em;">${creditCode}</p>
       </div>`
    : `<p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
         Your class credit has been restored to your pass.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, unfortunately we've had to cancel
      <strong>${cls?.title ?? classId}</strong> on <strong>${formattedDate}</strong>.
      We're sorry for the inconvenience.
    </p>
    ${creditBlock}
    <p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      View my bookings →
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Class cancelled"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Class cancelled — ${cls?.title ?? classId}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Class cancelled email sent to ${email}`);
  } catch (err) {
    console.error("✗ Class cancelled email failed:", err.message);
  }
}

async function sendRescheduleEmail({ name, email, classId, date, oldClassId, oldDate, bookingId }) {
  const cls           = await resolveClass(classId);
  const oldCls        = await resolveClass(oldClassId);
  const formattedDate = formatDate(date);
  const formattedOld  = formatDate(oldDate);

  if (!cls) { console.error(`sendRescheduleEmail: unknown classId ${classId}`); return; }

  const wasRow = `
    <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
      <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Previously</td>
      <td style="padding:10px 20px; font-size:13px; color:${s.colorTextMuted}; text-decoration:line-through;">
        ${oldCls?.title ?? oldClassId}, ${formattedOld}
      </td>
    </tr>`;

  const paymentRow = `
    <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
      <td colspan="2" style="padding:10px 20px; font-size:13px; color:${s.colorTextMuted};">
        Your original payment has been carried over — no charge or refund applies.
      </td>
    </tr>`;

  const manageLinkBlock = bookingId
    ? `<p style="margin:20px 0 0; font-size:13px; color:${s.colorTextMuted};">
         Need to make another change?
         <a href="${MY_BOOKINGS}?reschedule=${bookingId}" style="color:${s.colorPrimary}; text-decoration:none;">Reschedule</a>
         &nbsp;·&nbsp;
         <a href="${MY_BOOKINGS}?cancel=${bookingId}" style="color:${s.colorPrimary}; text-decoration:none;">Cancel</a>
       </p>` : "";

  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your booking has been moved. Here are your updated class details:
    </p>
    ${classDetailRows(cls, formattedDate, wasRow + paymentRow)}
    <p style="margin:0; font-size:13px; color:${s.colorTextMuted}; line-height:1.7;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>
    ${manageLinkBlock}`;

  const html = emailShell(bannerHtml("Booking updated", "You're rescheduled!"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Booking rescheduled — ${cls.title}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Reschedule email sent to ${email}`);
  } catch (err) {
    console.error("✗ Reschedule email failed:", err.message);
  }
}

 async function sendPrivatePassPromptEmail({ studentName, studentEmail, className, date, time, duration }) {
  const html = privatePassPromptHtml({ studentName, className, date, time, duration });

  const dateObj = new Date(`${date}T12:00:00`);
  const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: studentEmail }], subject: `Private class on ${shortDate} — pass required to confirm`, htmlContent: html, replyTo: { email: 'info@iy-sp.com' } });
}

// ── Pass purchase confirmation ─────────────────────────────
async function sendPassPurchaseEmail({ name, email, pass }) {
  const PASS_LABELS = { dropin: "Single Class", pass4: "4-Class Pass", pass8: "8-Class Pass" };

  const expiryLine = pass.expiresAt
    ? `<tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
         <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Expires</td>
         <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">
           ${pass.expiresAt.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
         </td>
       </tr>` : "";

  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your pass is ready. Use the code below when booking a class.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Your Pass</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Type</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">
          ${PASS_LABELS[pass.type] ?? pass.type}
        </td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Classes</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${pass.classesTotal}</td>
      </tr>
      ${expiryLine}
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Pass code</td>
        <td style="padding:10px 20px; font-size:20px; font-weight:700; color:${s.colorPrimary};
                    letter-spacing:0.08em;">${pass.code}</td>
      </tr>
    </table>
    <p style="margin:0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Book a class →
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Your pass is confirmed!"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Your ${PASS_LABELS[pass.type] ?? "pass"} — ${pass.code}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Pass purchase email sent to ${email}`);
  } catch (err) {
    console.error("✗ Pass purchase email failed:", err.message);
  }
}
async function sendGetStartedEmail({ name, email, pass }) {
  const PASS_LABELS = { dropin: "Single Class", pass4: "4-Class Pass", pass8: "8-Class Pass" };

  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, you're almost ready to start! Two quick things before your first class:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Your Pass</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Type</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">
          ${PASS_LABELS[pass.type] ?? pass.type}
        </td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Pass code</td>
        <td style="padding:10px 20px; font-size:20px; font-weight:700; color:${s.colorPrimary};
                    letter-spacing:0.08em;">${pass.code}</td>
      </tr>
    </table>
    <ol style="margin:0 0 24px; padding-left:20px; font-size:14px; color:${s.colorTextBody}; line-height:1.9;">
      <li><strong>Sign the liability waiver</strong> — required before your first class.</li>
      <li><strong>Book your first class</strong> — use the pass code above.</li>
    </ol>
    <a href="https://iy-sp.com/waiver"
      style="display:inline-block; margin-right:12px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Sign waiver →
    </a>
    <a href="${PRICING_URL}"
      style="display:inline-block; border:1px solid ${s.colorPrimary}; color:${s.colorPrimary};
             padding:9px 23px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Book a class →
    </a>
    <p style="margin:24px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Let's get you started!"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email }], cc: [{ email: MAIL_CC }], subject: `Ready when you are, ${name.split(" ")[0]}`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Get-started email sent to ${email}`);
  } catch (err) {
    console.error("✗ Get-started email failed:", err.message);
  }
}

// ─── Membership emails ─────────────────────────────────────

const MEMBERSHIP_LABELS = {
  member2x:  "Committed Membership (2×/week)",
  memberUnl: "Monthly",
};

// Headline display price (what we advertise) and the actual gross charge
// after Stripe's "pass card fees to customer" surcharge. Customers see the
// actual charge on their statement, so the welcome email spells it out.
const MEMBERSHIP_PRICES = {
  member2x:  { display: `$${+require("./config/pricing").memberships.member2x.display}`, actual: `$${require("./config/pricing").memberships.member2x.actualCharge.toFixed(2)}` },
  memberUnl: { display: `$${+require("./config/pricing").memberships.memberUnl.display}`, actual: `$${require("./config/pricing").memberships.memberUnl.actualCharge.toFixed(2)}` },
};

function membershipDetailsTable(pass) {
  const allowance = pass.classesTotal === null
    ? "Unlimited"
    : `${pass.classesTotal} classes / month`;
  const renewalLine = pass.currentPeriodEnd
    ? `<tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
         <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Next renewal</td>
         <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">
           ${pass.currentPeriodEnd.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
         </td>
       </tr>`
    : "";

  return `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Your Membership</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Plan</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">
          ${MEMBERSHIP_LABELS[pass.type] ?? pass.type}
        </td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Monthly billing</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">
          ${MEMBERSHIP_PRICES[pass.type]?.actual ?? ""} / month <span style="color:${s.colorTextMuted}; font-size:12px;">(includes card fee)</span>
        </td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">This month's classes</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${allowance}</td>
      </tr>
      ${renewalLine}
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Member code</td>
        <td style="padding:10px 20px; font-size:20px; font-weight:700; color:${s.colorPrimary};
                    letter-spacing:0.08em;">${pass.code}</td>
      </tr>
    </table>`;
}

async function sendMembershipPurchaseEmail({ name, email, pass }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Welcome, ${firstName} — your membership is active. Use the member code below
      whenever you book a class. You'll receive a fresh ${pass.classesTotal === null ? "unlimited" : pass.classesTotal + "-class"} allowance each month
      while your membership is active.
    </p>
    ${membershipDetailsTable(pass)}
    <p style="margin:0 0 16px; font-size:14px; color:${s.colorTextBody}; line-height:1.6;">
      <strong>Heads up:</strong> Your card will be charged ${MEMBERSHIP_PRICES[pass.type]?.actual ?? ""} automatically
      each month (this includes the card processing fee on the ${MEMBERSHIP_PRICES[pass.type]?.display ?? ""} membership)
      until you cancel. You can cancel, update your card, or view invoices anytime
      from your bookings page.
    </p>
    <p style="margin:0 0 24px; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-right:8px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Manage membership →
    </a>
    <a href="${PRICING_URL.replace('/pricing','')}"
      style="display:inline-block; background:transparent; color:${s.colorPrimary};
             padding:10px 24px; border:1px solid ${s.colorPrimary}; border-radius:6px;
             text-decoration:none; font-size:14px; font-weight:500;">
      Book a class
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Welcome to the membership"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Welcome — your ${MEMBERSHIP_LABELS[pass.type] ?? "membership"} is active`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Membership welcome email sent to ${email}`);
  } catch (err) {
    console.error("✗ Membership welcome email failed:", err.message);
  }
}

async function sendMembershipRenewalEmail({ name, email, pass }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${firstName} — your membership has renewed for another month and your class
      allowance is fresh. No action needed.
    </p>
    ${membershipDetailsTable(pass)}
    <p style="margin:0 0 24px; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      To update your card, view past invoices, or cancel, visit your bookings page.
      Questions? Reply to this email.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Manage membership →
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Membership renewed"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Your ${MEMBERSHIP_LABELS[pass.type] ?? "membership"} has renewed`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Membership renewal email sent to ${email}`);
  } catch (err) {
    console.error("✗ Membership renewal email failed:", err.message);
  }
}

async function sendMembershipCancelledEmail({ name, email, pass }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${firstName} — your ${MEMBERSHIP_LABELS[pass.type] ?? "membership"} has ended.
      No further charges will be made. We're sorry to see you go and hope to practice
      with you again soon.
    </p>
    <p style="margin:0 0 24px; font-size:14px; color:${s.colorTextBody}; line-height:1.6;">
      If this was a mistake, or you'd like to come back, you can subscribe again
      anytime from the pricing page.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      View pricing →
    </a>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Membership ended"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: email }], subject: `Your ${MEMBERSHIP_LABELS[pass.type] ?? "membership"} has ended`, htmlContent: html, replyTo: { email: REPLY_TO } });
    console.log(`✓ Membership cancellation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Membership cancellation email failed:", err.message);
  }
}

async function sendAdminBookingAlert({ adminEmail, studentName, studentEmail, cls, date, paymentType, classesRemaining }) {
  const classTitle = cls?.title || "Class";
  const dateStr    = formatDate(date);
  const payment    = formatPaymentType(paymentType);
  const remaining  = classesRemaining !== null && classesRemaining !== undefined
    ? `<tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
         <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Classes remaining</td>
         <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark}; font-weight:600;">${classesRemaining}</td>
       </tr>` : "";

  const bodyHtml = `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Booking Details</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Student</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">${studentName}</td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Email</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${studentEmail}</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Class</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${classTitle}</td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Date</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${dateStr}</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Payment</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${payment}</td>
      </tr>
      ${remaining}
    </table>`;

  const html = emailShell(bannerHtml("New Booking", `${studentName} — ${classTitle}`), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: adminEmail }], subject: `New booking — ${studentName} · ${classTitle} · ${dateStr}`, htmlContent: html });
  } catch (err) {
    console.error("✗ Admin booking alert failed:", err.message);
  }
}

async function sendAdminCancellationAlert({ adminEmail, studentName, studentEmail, cls, date, paymentType }) {
  const classTitle = cls?.title || "Class";
  const dateStr    = formatDate(date);
  const payment    = formatPaymentType(paymentType);

  const bodyHtml = `
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Cancellation Details</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Student</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">${studentName}</td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Email</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${studentEmail}</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Class</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${classTitle}</td>
      </tr>
      <tr style="background:${s.colorBgPage}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Date</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${dateStr}</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 16px; color:${s.colorTextMuted}; font-size:13px;">Payment type</td>
        <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${payment}</td>
      </tr>
    </table>`;

  const html = emailShell(bannerHtml("Booking Cancelled", `${studentName} — ${classTitle}`), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: adminEmail }], subject: `Cancellation — ${studentName} · ${classTitle} · ${dateStr}`, htmlContent: html });
  } catch (err) {
    console.error("✗ Admin cancellation alert failed:", err.message);
  }
}

async function sendAdminDigest({ adminEmail, cls, date, students }) {
  const classTitle = cls?.title || "Class";
  const dateStr    = formatDate(date);
  const time       = cls?.time || "";
  const venue      = cls?.online ? "Online (Zoom)" : (cls?.venue || "");
  const count      = students.length;

  const studentRows = count
    ? students.map((s2, i) => `
        <tr style="background:${i % 2 === 0 ? s.colorBgLight : s.colorBgWhite};">
          <td style="padding:10px 16px; font-size:13px; color:${s.colorTextMuted};">${i + 1}</td>
          <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${s2.studentName}</td>
          <td style="padding:10px 16px; font-size:13px; color:${s.colorTextMuted};">${s2.studentEmail}</td>
          <td style="padding:10px 16px; font-size:13px; color:${s.colorTextMuted};">${formatPaymentType(s2.paymentType)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="padding:16px; text-align:center; color:${s.colorTextMuted}; font-size:14px;">No students booked</td></tr>`;

  const bodyHtml = `
    <p style="margin:0 0 8px; font-size:13px; color:${s.colorTextMuted};">
      ${dateStr}${time ? " · " + time : ""}${venue ? " · " + venue : ""}
    </p>
    <p style="margin:0 0 20px; font-size:15px; color:${s.colorTextBody}; font-weight:600;">
      ${count} confirmed student${count !== 1 ? "s" : ""}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorPrimary};">
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.1em; text-transform:uppercase;">#</td>
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.1em; text-transform:uppercase;">Name</td>
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.1em; text-transform:uppercase;">Email</td>
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.1em; text-transform:uppercase;">Payment</td>
      </tr>
      ${studentRows}
    </table>
    <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
      ${count} student${count !== 1 ? "s" : ""} · ${classTitle} · ${dateStr}
    </p>`;

  const html = emailShell(bannerHtml("Class Digest", classTitle), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: adminEmail }], subject: `Class digest — ${classTitle} · ${dateStr} · ${count} student${count !== 1 ? "s" : ""}`, htmlContent: html });
  } catch (err) {
    console.error("✗ Admin digest failed:", err.message);
  }
}
async function sendWelcomeEmail({ studentEmail, studentName, passType, classesTotal, expiresAt, passCode }) {
  const isMember = passType === 'member2x' || passType === 'memberUnl';
  const subject  = isMember
    ? 'Welcome to your membership — ' + (process.env.STUDIO_NAME || 'Iyengar Yoga St. Petersburg')
    : 'You\'re all set — ' + (process.env.STUDIO_NAME || 'Iyengar Yoga St. Petersburg');
  const body = welcomeEmailHtml({ name: studentName, passType, classesTotal, expiresAt, passCode });
  const html = emailShell(bannerHtml('Welcome! 🌿', isMember ? 'Your membership is active' : 'Your pass is ready'), body);
  await brevoClient.transactionalEmails.sendTransacEmail({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: studentEmail }], subject, htmlContent: html });
}

async function sendVideoLinkEmail(studentEmail, videoTitle, playbackUrl) {
  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Your class recording is ready — grab a mat, settle in, and enjoy practicing on your own time.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorBgLight};">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Now Playing</td>
      </tr>
      <tr style="border-top:1px solid ${s.colorBorder};">
        <td style="padding:16px 20px; font-size:18px; color:${s.colorTextDark}; font-weight:600;">
          ${videoTitle}
        </td>
      </tr>
    </table>
    <a href="${playbackUrl}"
      style="display:inline-block; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:12px 28px; border-radius:6px; text-decoration:none; font-size:15px; font-weight:600;">
      Watch Now →
    </a>
    <p style="margin:24px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.
    </p>`;

  const html = emailShell(bannerHtml(MAIL_BANNER, "Your class is ready! 🌿"), bodyHtml);

  try {
    const result = await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: studentEmail }],
      subject: `Your class recording: ${videoTitle}`,
      htmlContent: html,
      replyTo: { email: REPLY_TO },
    });
    console.log("✓ Video link email sent to", studentEmail, result);
  } catch (err) {
    console.error("✗ Video link email failed:", err.message);
    throw err;
  }
}

async function sendBulkEmail({ email, name, subject, bodyText, signatureHtml = "", replyTo = null, bcc = null }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">Hi ${firstName},</p>
    ${paragraphs}
    ${signatureHtml}`;

  const html = emailShell(bannerHtml(MAIL_BANNER, subject), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: replyTo || { email: REPLY_TO },
      ...(bcc ? { bcc: [{ email: bcc }] } : {}),
      subject,
      htmlContent: html,
    });
    return { email, sent: true };
  } catch (err) {
    console.error(`✗ Bulk email failed for ${email}:`, err.message);
    return { email, sent: false, error: err.message };
  }
}



async function sendMembershipAgreementEmail({ name, email, membershipType, pdfBuffer }) {
  const { memberships } = require("./config/pricing");
  const label = (memberships[membershipType] && memberships[membershipType].agreementLabel) || "Membership";
  const safeName = String(name || "").replace(/[<>&"]/g, "");
  const result = await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email }],
    bcc: [{ email: MAIL_BCC }],
    subject: `Your signed ${label} agreement — ${FROM_NAME}`,
    htmlContent: `<p>Hi ${safeName},</p><p>Your signed ${label} agreement is attached for your records.</p><p>Questions? Reply to this email or write to ${MAIL_CONTACT}.</p>`,
    attachment: [{ content: pdfBuffer.toString("base64"), name: "membership-agreement.pdf" }],
  });
  console.log("✓ Membership agreement email sent to", email);
  return result;
}

module.exports = {
  sendMembershipAgreementEmail,
  sendBulkEmail,
  sendBookingConfirmation,
  sendWorkshopConfirmationEmail,
  sendCancellationEmail,
  sendClassCancelledEmail,
  sendRescheduleEmail,
  sendPrivatePassPromptEmail,
  sendWaiverEmail,
  sendPassPurchaseEmail,
  sendMembershipPurchaseEmail,
  sendMembershipRenewalEmail,
  sendMembershipCancelledEmail,
  sendAdminBookingAlert,
  sendAdminCancellationAlert,
  sendAdminDigest,
  sendWelcomeEmail,
  sendPassReminderEmail,
  sendGetStartedEmail,
  sendVideoLinkEmail,
};


// ── Waitlist ──────────────────────────────────────────────
// Studio-neutral: names come from STUDIO_NAME / FROM_NAME, never a hardcoded studio.
const waitlistStudio = () => process.env.STUDIO_NAME || FROM_NAME;
const time12 = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};
const escW = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const waitlistWhen = (cls, date) => `${formatDate(date)}${cls?.time ? `, ${time12(cls.time)}` : ""}`;
const holdText = (d) => new Date(d).toLocaleString("en-US", {
  timeZone: process.env.STUDIO_TZ || "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const wlPara = (html, muted = false) => `<p style="margin:0 0 16px; font-size:${muted ? 13 : 15}px; color:${muted ? s.colorTextMuted : s.colorTextBody}; line-height:1.6;">${html}</p>`;
const wlButton = (href, label, primary = true) => `<a href="${escW(href)}"
  style="display:inline-block; margin:8px 8px 0 0; padding:11px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:600;
         ${primary ? `background:${s.colorPrimary}; color:${s.colorTextWhite};` : `background:transparent; color:${s.colorPrimary}; border:1px solid ${s.colorPrimary};`}">${label}</a>`;
const wlContact = () => wlPara(`Questions? Contact <a href="mailto:${MAIL_CONTACT}" style="color:${s.colorPrimary}; text-decoration:none;">${MAIL_CONTACT}</a>.`, true);
async function wlSend(to, subject, banner, body) {
  const html = emailShell(bannerHtml(MAIL_BANNER, banner), body);
  await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: to }], subject, htmlContent: html, replyTo: { email: REPLY_TO },
  });
}
const firstName = (n) => escW(String(n || "").split(" ")[0] || "there");

async function sendWaitlistConfirmationEmail({ studentEmail, studentName, cls, date, position, holdHours = 12 }) {
  const body =
    wlPara(`Hi ${firstName(studentName)}, you're <strong>#${position}</strong> on the waitlist for <strong>${escW(cls?.title)}</strong> on <strong>${waitlistWhen(cls, date)}</strong>.`) +
    wlPara(`If a spot opens while you're first in line, we'll email you and hold it for you for up to ${holdHours} hours. You can confirm it or pass it on to the next person.`, false) +
    wlPara("You haven't been charged.", true) + wlContact();
  await wlSend(studentEmail, `You're on the waitlist — ${cls?.title ?? "class"} (${waitlistStudio()})`, "You're on the waitlist", body);
  console.log(`✓ Waitlist confirmation sent to ${studentEmail} (#${position})`);
}

async function sendWaitlistOfferEmail({ studentEmail, studentName, cls, date, holdUntil, confirmUrl, cancelUrl }) {
  const body =
    wlPara(`Hi ${firstName(studentName)}, a spot has opened in <strong>${escW(cls?.title)}</strong> on <strong>${waitlistWhen(cls, date)}</strong>, and it's yours if you want it.`) +
    wlPara(`We're holding it for you until <strong>${holdText(holdUntil)}</strong>. After that it goes to the next person on the waitlist.`) +
    `<div style="margin:4px 0 20px;">${wlButton(confirmUrl, "Confirm my spot")}${wlButton(cancelUrl, "Cancel — give it to the next person", false)}</div>` +
    wlPara("If you have a pass or membership, Confirm books you straight in. Otherwise Confirm takes you to pay for the class.", true) + wlContact();
  await wlSend(studentEmail, `A spot has opened — ${cls?.title ?? "class"} on ${formatDate(date)}`, "A spot has opened for you", body);
}

async function sendWaitlistDeclinedEmail({ studentEmail, studentName, cls, date }) {
  const body =
    wlPara(`Hi ${firstName(studentName)}, you've let the spot go in <strong>${escW(cls?.title)}</strong> on <strong>${waitlistWhen(cls, date)}</strong>, and you're off the waitlist for that class.`) +
    wlPara("We've offered it to the next person in line. You haven't been charged.", true) + wlContact();
  await wlSend(studentEmail, `You're off the waitlist — ${cls?.title ?? "class"} on ${formatDate(date)}`, "Spot passed on", body);
}

async function sendWaitlistExpiredEmail({ studentEmail, studentName, cls, date }) {
  const body =
    wlPara(`Hi ${firstName(studentName)}, we held a spot for you in <strong>${escW(cls?.title)}</strong> on <strong>${waitlistWhen(cls, date)}</strong>, but the hold has run out, so it's gone to the next person and you're off the waitlist.`) +
    wlPara("You haven't been charged. If the class still has room later, you're welcome to book or join the waitlist again.", true) + wlContact();
  await wlSend(studentEmail, `Your held spot has passed on — ${cls?.title ?? "class"} on ${formatDate(date)}`, "Your hold has ended", body);
}

module.exports.sendWaitlistConfirmationEmail = sendWaitlistConfirmationEmail;
module.exports.sendWaitlistOfferEmail = sendWaitlistOfferEmail;
module.exports.sendWaitlistDeclinedEmail = sendWaitlistDeclinedEmail;
module.exports.sendWaitlistExpiredEmail = sendWaitlistExpiredEmail;

// ── Branded site forms (/forms/:slug) ─────────────────────
// Studio gets the full responses; the student gets a confirmation only
// (no health answers echoed back to an inbox they may share).
const escForm = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendFormSubmissionEmails({ formTitle, name, email, rows, submittedAt }) {
  const when = new Date(submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  const answered = rows.filter((r) => String(r.a).trim());

  const tableRows = answered.map((r, i) => `
    <tr style="background:${i % 2 ? s.colorBgRow : s.colorBgWhite};">
      <td style="padding:10px 12px; border-bottom:1px solid ${s.colorBorderLight}; font-size:12px; color:${s.colorTextMuted}; vertical-align:top; width:45%;">${escForm(r.q)}</td>
      <td style="padding:10px 12px; border-bottom:1px solid ${s.colorBorderLight}; font-size:13px; color:${s.colorTextDark}; vertical-align:top; white-space:pre-wrap;">${escForm(r.a)}</td>
    </tr>`).join("");

  const studioBody = `
    <p style="margin:0 0 6px; color:${s.colorTextBody};"><strong>${escForm(name)}</strong>${email ? ` · <a href="mailto:${escForm(email)}" style="color:${s.colorPrimary};">${escForm(email)}</a>` : ""}</p>
    <p style="margin:0 0 20px; font-size:12px; color:${s.colorTextMuted};">Submitted ${escForm(when)} · ${answered.length} of ${rows.length} questions answered</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${s.colorBorder}; border-radius:8px; border-collapse:separate; overflow:hidden;">${tableRows || `<tr><td style="padding:12px; color:${s.colorTextMuted};">No answers beyond name/email.</td></tr>`}</table>`;

  const sends = [
    brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: process.env.FORMS_NOTIFY_EMAIL || MAIL_CONTACT }],
      ...(email ? { replyTo: { email, name } } : {}),
      subject: `${formTitle} — ${name}`,
      htmlContent: emailShell(bannerHtml("New form submission", escForm(formTitle)), studioBody),
    }),
  ];

  if (email) {
    const studentBody = `
      <p style="margin:0 0 14px; color:${s.colorTextBody};">Hi ${escForm(name.split(" ")[0])},</p>
      <p style="margin:0 0 14px; color:${s.colorTextBody};">Thank you — we've received your <strong>${escForm(formTitle.toLowerCase())}</strong>.</p>
      <p style="margin:0; color:${s.colorTextBody};">If anything changes before we see you, just reply to this email.</p>`;
    sends.push(brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email, name }],
      replyTo: { email: MAIL_CONTACT },
      subject: `Received: ${formTitle}`,
      htmlContent: emailShell(bannerHtml("Thank you", "We've got it"), studentBody),
    }));
  }

  const results = await Promise.allSettled(sends);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) throw new Error(failed.map((f) => f.reason?.message).join("; "));
}
module.exports.sendFormSubmissionEmails = sendFormSubmissionEmails;
