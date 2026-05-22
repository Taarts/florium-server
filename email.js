const { BrevoClient } = require("@getbrevo/brevo");
const brevoClient = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
const { bookingConfirmationHtml } = require("./emails/bookingConfirmation");
const s = require("./emails/emailStyles");

// ── Class details lookup ───────────────────────────────────
const CLASS_DETAILS = {
  cls_mon:        { title: "Iyengar Yoga",           day: "Monday",    time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_tue_pm:     { title: "Pilates Fundamentals",   day: "Tuesday",   time: "6:00 PM",  duration: 60, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712" },
  cls_wed:        { title: "Hatha Yoga",             day: "Wednesday", time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712" },
  cls_wed_eve:    { title: "Yin & Meditation",       day: "Wednesday", time: "7:00 PM",  duration: 75, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712" },
  cls_thu:        { title: "Power Pilates",          day: "Thursday",  time: "7:00 AM",  duration: 60, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712" },
  cls_fri:        { title: "Iyengar Yoga",           day: "Friday",    time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_sat_online: { title: "Iyengar Yoga — Online",  day: "Saturday",  time: "8:15 AM",  duration: 90, venue: "venue_online" },
  cls_sun_online: { title: "Iyengar Yoga — Online",  day: "Sunday",    time: "10:00 AM", duration: 90, venue: "venue_online" },
};

const FROM_EMAIL  = "info@florium.live";
const FROM_NAME   = "Florium.Live";
const REPLY_TO    = "info@florium.live";
const PRICING_URL = "https://florium.live/pricing";
const MY_BOOKINGS = "https://florium.live/my-bookings";

// ── Membership constants ───────────────────────────────────
const MEMBERSHIP_LABELS = {
  member2x:  "2x/week membership",
  memberUnl: "Unlimited membership",
};

const MEMBERSHIP_PRICES = {
  member2x:  { display: "2x/week",   actual: "$129/mo" },
  memberUnl: { display: "Unlimited", actual: "$169/mo" },
};

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
    memberUnl: "Membership — Unlimited",
  };
  return labels[type] || type;
}

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
                           text-transform:uppercase;">Florium</div>
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
              <p style="margin:0 0 4px; font-size:12px; color:${s.colorTextMuted};">Florium</p>
              <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
                <a href="${PRICING_URL}" style="color:${s.colorPrimary}; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>
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

function membershipDetailsTable(pass) {
  const label     = MEMBERSHIP_LABELS[pass.type] || pass.type;
  const allowance = pass.classesTotal === null ? "Unlimited" : pass.classesTotal + " classes";
  const expiry    = pass.expiresAt
    ? new Date(pass.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0 0 24px;">
      <tr style="background:${s.colorBgLight};">
        <td style="padding:10px 14px; font-size:13px; color:${s.colorTextMuted}; width:40%;">Membership</td>
        <td style="padding:10px 14px; font-size:14px; color:${s.colorTextDark}; font-weight:500;">${label}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px; font-size:13px; color:${s.colorTextMuted};">Monthly allowance</td>
        <td style="padding:10px 14px; font-size:14px; color:${s.colorTextDark};">${allowance}</td>
      </tr>
      <tr style="background:${s.colorBgLight};">
        <td style="padding:10px 14px; font-size:13px; color:${s.colorTextMuted};">Current period ends</td>
        <td style="padding:10px 14px; font-size:14px; color:${s.colorTextDark};">${expiry}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px; font-size:13px; color:${s.colorTextMuted};">Member code</td>
        <td style="padding:10px 14px; font-size:14px; color:${s.colorPrimary}; font-weight:500; letter-spacing:0.05em;">${pass.code}</td>
      </tr>
    </table>`;
}

// ── Booking confirmation ───────────────────────────────────
async function sendBookingConfirmation({ name, email, classId, date, paymentType, classesRemaining, bookingId }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  if (!cls) {
    console.error(`Unknown classId: ${classId}`);
    return;
  }

  const html = bookingConfirmationHtml({
    name, cls, formattedDate, paymentType, classesRemaining, formatPaymentType, bookingId,
  });

  console.log("Sending email to:", email, "API key starts with:", process.env.BREVO_API_KEY?.slice(0, 8));

  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email }],
      replyTo:     { email: REPLY_TO },
      subject:     `Booking confirmed — ${cls.title}, ${formattedDate}`,
      htmlContent: html,
    });
    console.log(`✓ Confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}

// ── Workshop confirmation ──────────────────────────────────
async function sendWorkshopConfirmationEmail({ name, email, workshopTitle, sessions, totalPrice }) {
  const sessionRows = sessions.map(session =>
    `<tr>
      <td style="padding:8px 12px; font-size:14px; color:${s.colorTextDark}; border-bottom:1px solid ${s.colorBorderLight};">${session.date}</td>
      <td style="padding:8px 12px; font-size:14px; color:${s.colorTextDark}; border-bottom:1px solid ${s.colorBorderLight};">${session.label}</td>
      <td style="padding:8px 12px; font-size:14px; color:${s.colorTextDark}; border-bottom:1px solid ${s.colorBorderLight};">${session.time}</td>
    </tr>`
  ).join("");

  const bodyHtml = `
    <p style="margin:0 0 20px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your booking for <strong>${workshopTitle}</strong> is confirmed.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorPrimary};">
        <td style="padding:10px 12px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Date</td>
        <td style="padding:10px 12px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Session</td>
        <td style="padding:10px 12px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Time</td>
      </tr>
      ${sessionRows}
    </table>
    <p style="margin:0 0 20px; font-size:15px; color:${s.colorTextBody}; font-weight:600;">
      Total paid: $${totalPrice}
    </p>
    <p style="margin:0; font-size:13px; color:${s.colorTextMuted}; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      View my bookings →
    </a>`;

  const html = emailShell(bannerHtml("Florium", `${workshopTitle} — Confirmed`), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email }],
      replyTo:     { email: REPLY_TO },
      subject:     `Booking confirmed — ${workshopTitle}`,
      htmlContent: html,
    });
    console.log(`✓ Workshop confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}
// ── Cancellation email ─────────────────────────────────────
async function sendCancellationEmail({ name, email, classId, date, creditCode = null }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:${s.colorBgLight};
                   border-left:3px solid ${s.colorGold}; border-radius:0 6px 6px 0;">
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
      <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none;
             font-size:14px; font-weight:500;">
      Book another class →
    </a>`;

  const html = emailShell(bannerHtml("Florium", "Booking cancelled"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Booking cancelled — ${cls?.title ?? classId}, ${formattedDate}`,
      htmlContent: html,
    });
  } catch (err) {
    console.error("✗ Cancellation email failed:", err.message);
  }
}

// ── Class cancelled by studio ──────────────────────────────
async function sendClassCancelledEmail({ name, email, classId, date, creditCode = null }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:${s.colorBgLight};
                   border-left:3px solid ${s.colorGold}; border-radius:0 6px 6px 0;">
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
      <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none;
             font-size:14px; font-weight:500;">
      View my bookings →
    </a>`;

  const html = emailShell(bannerHtml("Florium", "Class cancelled"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Class cancelled — ${cls?.title ?? classId}, ${formattedDate}`,
      htmlContent: html,
    });
  } catch (err) {
    console.error("✗ Class cancelled email failed:", err.message);
  }
}

// ── Reschedule email ───────────────────────────────────────
async function sendRescheduleEmail({ name, email, classId, date, oldClassId, oldDate, bookingId }) {
  const cls           = CLASS_DETAILS[classId];
  const oldCls        = CLASS_DETAILS[oldClassId];
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
      <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>.
    </p>
    ${manageLinkBlock}`;

  const html = emailShell(bannerHtml("Booking updated", "You're rescheduled!"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Booking rescheduled — ${cls.title}, ${formattedDate}`,
      htmlContent: html,
    });
  } catch (err) {
    console.error("✗ Reschedule email failed:", err.message);
  }
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
          ${PASS_LABELS[pass.type] || pass.type}
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
      <a href="mailto:info@florium.live" style="color:${s.colorPrimary}; text-decoration:none;">info@florium.live</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Book a class →
    </a>`;

  const html = emailShell(bannerHtml("Florium", "Your pass is confirmed!"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Your ${PASS_LABELS[pass.type] || "pass"} — ${pass.code}`,
      htmlContent: html,
    });
  } catch (err) {
    console.error("✗ Pass purchase email failed:", err.message);
  }
}

// ── Membership emails ──────────────────────────────────────
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
      <strong>Heads up:</strong> Your card will be charged ${MEMBERSHIP_PRICES[pass.type] ? MEMBERSHIP_PRICES[pass.type].actual : ""} automatically
      each month until you cancel. You can cancel, update your card, or view invoices anytime
      from your bookings page.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-right:8px; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      Manage membership →
    </a>`;

  const html = emailShell(bannerHtml("Florium", "Welcome to the membership"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Welcome — your ${MEMBERSHIP_LABELS[pass.type] || "membership"} is active`,
      htmlContent: html,
    });
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

  const html = emailShell(bannerHtml("Florium", "Membership renewed"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Your ${MEMBERSHIP_LABELS[pass.type] || "membership"} has renewed`,
      htmlContent: html,
    });
    console.log(`✓ Membership renewal email sent to ${email}`);
  } catch (err) {
    console.error("✗ Membership renewal email failed:", err.message);
  }
}

async function sendMembershipCancelledEmail({ name, email, pass }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      Hi ${firstName} — your ${MEMBERSHIP_LABELS[pass.type] || "membership"} has ended.
      No further charges will be made. We hope to practice with you again soon.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; background:${s.colorPrimary}; color:${s.colorTextWhite};
             padding:10px 24px; border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
      View pricing →
    </a>`;

  const html = emailShell(bannerHtml("Florium", "Membership ended"), bodyHtml);
  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      subject: `Your ${MEMBERSHIP_LABELS[pass.type] || "membership"} has ended`,
      htmlContent: html,
    });
    console.log(`✓ Membership cancellation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Membership cancellation email failed:", err.message);
  }
}

// ── Admin digest ───────────────────────────────────────────
async function sendAdminDigest({ adminEmail, cls, date, students, type, cc = [] }) {
  const formattedDate = formatDate(date);
  const isEvening     = type === "evening";
  const subject       = isEvening
    ? `Tomorrow's roster — ${cls.title}, ${formattedDate}`
    : `30-min reminder — ${cls.title} starting soon`;

  const studentRows = students.length
    ? students.map((s2, i) => `
        <tr style="background:${i % 2 === 0 ? s.colorBgLight : s.colorBgWhite};">
          <td style="padding:10px 16px; font-size:14px; color:${s.colorTextDark};">${s2.studentName}</td>
          <td style="padding:10px 16px; font-size:13px; color:${s.colorTextMuted};">${s2.studentEmail}</td>
          <td style="padding:10px 16px; font-size:13px; color:${s.colorTextMuted};">${formatPaymentType(s2.paymentType)}</td>
        </tr>`).join("")
    : `<tr>
        <td colspan="3" style="padding:16px; font-size:14px; color:${s.colorTextMuted}; text-align:center;">
          No students booked
        </td>
       </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 20px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
      ${isEvening
        ? `Here is tomorrow's roster for <strong>${cls.title}</strong> on <strong>${formattedDate}</strong>.`
        : `<strong>${cls.title}</strong> starts in 30 minutes (${cls.time}). Here's your roster.`}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:${s.colorPrimary};">
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Student</td>
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Email</td>
        <td style="padding:10px 16px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.85);
            letter-spacing:0.1em; text-transform:uppercase;">Payment</td>
      </tr>
      ${studentRows}
    </table>
    <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
      ${students.length} student${students.length !== 1 ? "s" : ""} booked
      · ${cls.title} · ${formattedDate} · ${cls.time}
    </p>`;

  const label = isEvening ? "Evening Digest" : "Pre-Class Reminder";
  const html  = emailShell(bannerHtml(label, cls.title), bodyHtml);

  try {
    await brevoClient.transactionalEmails.sendTransacEmail({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: adminEmail }],
      cc:          cc.length ? cc : undefined,
      replyTo:     { email: REPLY_TO },
      subject,
      htmlContent: html,
    });
    console.log(`✓ Admin digest (${type}) sent to ${adminEmail}`);
  } catch (err) {
    console.error("✗ Admin digest email failed:", err.message);
  }
}
module.exports = {
  sendBookingConfirmation,
  sendWorkshopConfirmationEmail,
  sendCancellationEmail,
  sendClassCancelledEmail,
  sendRescheduleEmail,
  sendPassPurchaseEmail,
  sendMembershipPurchaseEmail,
  sendMembershipRenewalEmail,
  sendMembershipCancelledEmail,
  sendAdminDigest, 
};
