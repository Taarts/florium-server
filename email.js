const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const { bookingConfirmationHtml } = require("./emails/bookingConfirmation");

// ── Class details lookup ───────────────────────────────────
// Mirrors recurringClasses from data.js — single source of truth
// TODO: once classes are stored in MongoDB, fetch from DB instead
const CLASS_DETAILS = {
  cls_mon: { title: "Iyengar Yoga",          day: "Monday",    time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_wed: { title: "Iyengar Yoga",          day: "Wednesday", time: "6:00 PM",  duration: 75, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_fri: { title: "Iyengar Yoga",          day: "Friday",    time: "10:00 AM", duration: 90, venue: "Journey into Fitness, 1799 Central Ave, St. Petersburg FL 33712", online: false },
  cls_sat: { title: "Iyengar Yoga — Online", day: "Saturday",  time: "8:15 AM",  duration: 90, online: true },
  cls_sun: { title: "Iyengar Yoga — Online", day: "Sunday",    time: "10:00 AM", duration: 90, online: true },
};

const FROM_EMAIL  = "Iyengar Yoga St. Petersburg <info@iy-sp.org>";
const REPLY_TO    = "info@iy-sp.org";
const PRICING_URL = "https://iy-sp.org/pricing";
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
    memberUnl: "Membership — Unlimited",
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
</head>
<body style="margin:0; padding:0; background:#f5f0f4; font-family:'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0f4; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px; background:white; border-radius:12px;
               box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="background:#faf7fb; padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid #e8e0ec;">
              <div style="display:inline-block; padding:8px 20px; border:1px solid #e8e0ec;
                           border-radius:6px; color:#842953; font-size:13px; letter-spacing:0.08em;
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
            <td style="padding:20px 40px; background:#f5f0f4; text-align:center;
                        border-top:1px solid #e8e0ec;">
              <p style="margin:0 0 4px; font-size:12px; color:#9b8fa8;">Iyengar Yoga St. Petersburg</p>
              <p style="margin:0; font-size:12px; color:#9b8fa8;">
                <a href="${PRICING_URL}" style="color:#842953; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">info@iy-sp.com</a>
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

// Plum banner — reused across confirmation, reschedule, cancellation emails
function bannerHtml(label, heading) {
  return `
  <tr>
    <td style="background:#842953; padding:24px 40px; text-align:center;">
      <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                 letter-spacing:0.14em; text-transform:uppercase;">${label}</p>
      <h1 style="margin:8px 0 0; color:white; font-size:26px; font-weight:300;
                  letter-spacing:0.03em;">${heading}</h1>
    </td>
  </tr>`;
}

// Class detail table rows — used in confirmation + reschedule emails
function classDetailRows(cls, formattedDate, extraRows = "") {
  const locationRow = cls.online
    ? `<tr style="border-top:1px solid #f0eaf4;">
         <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Location</td>
         <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">Online via Zoom</td>
       </tr>`
    : `<tr style="border-top:1px solid #f0eaf4;">
         <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Location</td>
         <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${cls.venue}</td>
       </tr>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #e8e0ec; border-radius:8px; overflow:hidden; margin-bottom:24px;">
    <tr style="background:#faf7fb;">
      <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
          color:#842953; letter-spacing:0.1em; text-transform:uppercase;">Class Details</td>
    </tr>
    <tr style="border-top:1px solid #e8e0ec;">
      <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Class</td>
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e; font-weight:500;">${cls.title}</td>
    </tr>
    <tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
      <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Date</td>
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${formattedDate}</td>
    </tr>
    <tr style="border-top:1px solid #f0eaf4;">
      <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Time</td>
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${cls.time} · ${cls.duration} min</td>
    </tr>
    ${locationRow}
    ${extraRows}
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

  console.log("Sending email to:", email, "API key starts with:", process.env.RESEND_API_KEY?.slice(0, 8));

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Booking confirmed — ${cls.title}, ${formattedDate}`,
      html,
    });
    console.log(`✓ Confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}

// ── Workshop confirmation ──────────────────────────────────
async function sendWorkshopConfirmationEmail({ name, email, workshopTitle, sessions, totalPrice }) {
  const sessionRows = sessions.map(s =>
    `<tr>
      <td style="padding:6px 12px;">${s.date}</td>
      <td style="padding:6px 12px;">${s.label}</td>
      <td style="padding:6px 12px;">${s.time}</td>
    </tr>`
  ).join("");

  const html = `
    <p>Hi ${name},</p>
    <p>Your booking for <strong>${workshopTitle}</strong> is confirmed.</p>
    <table style="border-collapse:collapse;width:100%;">
      <thead>
        <tr>
          <th style="padding:6px 12px;text-align:left;">Date</th>
          <th style="padding:6px 12px;text-align:left;">Session</th>
          <th style="padding:6px 12px;text-align:left;">Time</th>
        </tr>
      </thead>
      <tbody>${sessionRows}</tbody>
    </table>
    <p><strong>Total paid: $${totalPrice}</strong></p>
    <p>See you on the mat!</p>
  `;

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Booking confirmed — ${workshopTitle}`,
      html,
    });
    console.log(`✓ Workshop confirmation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Email send failed:", err.message);
  }
}

// ── Cancellation email ─────────────────────────────────────
// creditCode — present when admin cancelled a drop-in booking (class credit issued)
//            — null for pass holders (credit restored to pass) or student self-cancel
async function sendCancellationEmail({ name, email, classId, date, creditCode = null }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:#fdf8ff;
                   border-left:3px solid #e58684; border-radius:0 6px 6px 0;">
         <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:#842953;
                    letter-spacing:0.1em; text-transform:uppercase;">Your credit</p>
         <p style="margin:0 0 8px; font-size:13px; color:#4a4a6a; line-height:1.6;">
           As this class was cancelled by the studio, we've issued you a 1-class credit pass.
           Use the code below when booking your next class.
         </p>
         <p style="margin:0; font-size:18px; font-weight:600; color:#842953;
                    letter-spacing:0.08em;">${creditCode}</p>
       </div>`
    : `<p style="margin:16px 0 0; font-size:13px; color:#6b6b8a; line-height:1.6;">
         If you used a pass for this booking, your class credit has been restored.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; color:#4a4a6a; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your booking for
      <strong>${cls?.title ?? classId}</strong> on
      <strong>${formattedDate}</strong> has been cancelled.
    </p>
    ${creditBlock}
    <p style="margin:16px 0 0; font-size:13px; color:#6b6b8a; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">info@iy-sp.com</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:#842953; color:white;
             padding:10px 24px; border-radius:6px; text-decoration:none;
             font-size:14px; font-weight:500;">
      Book another class →
    </a>`;

  const html = emailShell(bannerHtml("Iyengar Yoga · St. Petersburg", "Booking cancelled"), bodyHtml);

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Booking cancelled — ${cls?.title ?? classId}, ${formattedDate}`,
      html,
    });
    console.log(`✓ Cancellation email sent to ${email}`);
  } catch (err) {
    console.error("✗ Cancellation email failed:", err.message);
  }
}

// ── Class cancelled by studio ──────────────────────────────
// Sent to all students when admin cancels an entire class date.
// Pass holders: credit restored to pass (handled in route, noted in email).
// Drop-ins: CREDIT-XXXX pass code issued (handled in route, shown in email).
async function sendClassCancelledEmail({ name, email, classId, date, creditCode = null }) {
  const cls           = CLASS_DETAILS[classId];
  const formattedDate = formatDate(date);

  const creditBlock = creditCode
    ? `<div style="margin:20px 0; padding:16px 20px; background:#fdf8ff;
                   border-left:3px solid #e58684; border-radius:0 6px 6px 0;">
         <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:#842953;
                    letter-spacing:0.1em; text-transform:uppercase;">Your credit pass</p>
         <p style="margin:0 0 8px; font-size:13px; color:#4a4a6a; line-height:1.6;">
           We've issued you a 1-class credit to use toward any future class.
           Enter this code when booking:
         </p>
         <p style="margin:0; font-size:18px; font-weight:600; color:#842953;
                    letter-spacing:0.08em;">${creditCode}</p>
       </div>`
    : `<p style="margin:16px 0 0; font-size:13px; color:#6b6b8a; line-height:1.6;">
         Your class credit has been restored to your pass.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:15px; color:#4a4a6a; line-height:1.6;">
      Hi ${name.split(" ")[0]}, unfortunately we've had to cancel
      <strong>${cls?.title ?? classId}</strong> on <strong>${formattedDate}</strong>.
      We're sorry for the inconvenience.
    </p>
    ${creditBlock}
    <p style="margin:16px 0 0; font-size:13px; color:#6b6b8a; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">info@iy-sp.com</a>.
    </p>
    <a href="${MY_BOOKINGS}"
      style="display:inline-block; margin-top:20px; background:#842953; color:white;
             padding:10px 24px; border-radius:6px; text-decoration:none;
             font-size:14px; font-weight:500;">
      View my bookings →
    </a>`;

  const html = emailShell(bannerHtml("Iyengar Yoga · St. Petersburg", "Class cancelled"), bodyHtml);

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Class cancelled — ${cls?.title ?? classId}, ${formattedDate}`,
      html,
    });
    console.log(`✓ Class cancelled email sent to ${email}`);
  } catch (err) {
    console.error("✗ Class cancelled email failed:", err.message);
  }
}

// ── Reschedule email ───────────────────────────────────────
// Sent to student when a booking is moved to a new class/date,
// either by admin or by the student themselves via My Bookings.
async function sendRescheduleEmail({ name, email, classId, date, oldClassId, oldDate, bookingId }) {
  const cls           = CLASS_DETAILS[classId];
  const oldCls        = CLASS_DETAILS[oldClassId];
  const formattedDate = formatDate(date);
  const formattedOld  = formatDate(oldDate);

  if (!cls) {
    console.error(`sendRescheduleEmail: unknown classId ${classId}`);
    return;
  }

  const wasRow = `
    <tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
      <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Previously</td>
      <td style="padding:10px 20px; font-size:13px; color:#9b8fa8; text-decoration:line-through;">
        ${oldCls?.title ?? oldClassId}, ${formattedOld}
      </td>
    </tr>`;

  const paymentRow = `
    <tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
      <td colspan="2" style="padding:10px 20px; font-size:13px; color:#6b6b8a;">
        Your original payment has been carried over — no charge or refund applies.
      </td>
    </tr>`;

  const detailTable = classDetailRows(cls, formattedDate, wasRow + paymentRow);

  const manageLinkBlock = bookingId
    ? `<p style="margin:20px 0 0; font-size:13px; color:#9b8fa8;">
         Need to make another change?
         <a href="${MY_BOOKINGS}?reschedule=${bookingId}"
            style="color:#842953; text-decoration:none;">Reschedule</a>
         &nbsp;·&nbsp;
         <a href="${MY_BOOKINGS}?cancel=${bookingId}"
            style="color:#842953; text-decoration:none;">Cancel</a>
       </p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:#4a4a6a; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your booking has been moved. Here are your updated class details:
    </p>
    ${detailTable}
    <p style="margin:0; font-size:13px; color:#9b8fa8; line-height:1.7;">
      Questions? Reply to this email or contact
      <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">info@iy-sp.com</a>.
    </p>
    ${manageLinkBlock}`;

  const html = emailShell(bannerHtml("Booking updated", "You're rescheduled!"), bodyHtml);

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Booking rescheduled — ${cls.title}, ${formattedDate}`,
      html,
    });
    console.log(`✓ Reschedule email sent to ${email}`);
  } catch (err) {
    console.error("✗ Reschedule email failed:", err.message);
  }
}
// ── Pass purchase confirmation ─────────────────────────────
async function sendPassPurchaseEmail({ name, email, pass }) {
  const PASS_LABELS = {
    dropin: "Single Class",
    pass4:  "4-Class Pass",
    pass8:  "8-Class Pass",
  };

  const expiryLine = pass.expiresAt
    ? `<tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
         <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Expires</td>
         <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">
           ${pass.expiresAt.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
         </td>
       </tr>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 24px; font-size:15px; color:#4a4a6a; line-height:1.6;">
      Hi ${name.split(" ")[0]}, your pass is ready. Use the code below when booking a class.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e8e0ec; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <tr style="background:#faf7fb;">
        <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
            color:#842953; letter-spacing:0.1em; text-transform:uppercase;">Your Pass</td>
      </tr>
      <tr style="border-top:1px solid #e8e0ec;">
        <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Type</td>
        <td style="padding:10px 20px; font-size:14px; color:#2d2d3e; font-weight:500;">
          ${PASS_LABELS[pass.type] ?? pass.type}
        </td>
      </tr>
      <tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
        <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Classes</td>
        <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${pass.classesTotal}</td>
      </tr>
      ${expiryLine}
      <tr style="border-top:1px solid #f0eaf4;">
        <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Pass code</td>
        <td style="padding:10px 20px; font-size:20px; font-weight:700; color:#842953;
                    letter-spacing:0.08em;">${pass.code}</td>
      </tr>
    </table>
    <p style="margin:0; font-size:13px; color:#6b6b8a; line-height:1.6;">
      Questions? Reply to this email or contact
      <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">info@iy-sp.com</a>.
    </p>
    <a href="${PRICING_URL}"
      style="display:inline-block; margin-top:20px; background:#842953; color:white;
             padding:10px 24px; border-radius:6px; text-decoration:none;
             font-size:14px; font-weight:500;">
      Book a class →
    </a>`;

  const html = emailShell(bannerHtml("Iyengar Yoga · St. Petersburg", "Your pass is confirmed!"), bodyHtml);

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      replyTo: REPLY_TO,
      subject: `Your ${PASS_LABELS[pass.type] ?? "pass"} — ${pass.code}`,
      html,
    });
    console.log(`✓ Pass purchase email sent to ${email}`);
  } catch (err) {
    console.error("✗ Pass purchase email failed:", err.message);
  }
}


module.exports = {
  sendBookingConfirmation,
  sendWorkshopConfirmationEmail,
  sendCancellationEmail,
  sendClassCancelledEmail,
  sendRescheduleEmail,
  sendPassPurchaseEmail,  
};
