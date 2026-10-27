const ZOOM_LINK    = process.env.ZOOM_LINK;
const PRICING_URL  = process.env.PRICING_URL  || "https://iy-sp.com/pricing";
const MY_BOOKINGS  = process.env.MY_BOOKINGS_URL || "https://iy-sp.com/my-bookings";
const STUDIO_NAME  = process.env.STUDIO_NAME  || "Iyengar Yoga St. Petersburg";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@iy-sp.com";
// Public (unauthenticated) image endpoint — see routes/reports.js. Must stay
// outside any admin-secret auth middleware since mail clients fetch <img src>
// with no Authorization header.
const CHECKIN_QR_BASE = process.env.CHECKIN_QR_BASE_URL || "https://iy-sp.com/api/reports/checkin";
const s            = require("./emailStyles");
const VENUE_MAP = {
  venue_001:    { name: 'Journey into Fitness', address: '1799 Central Ave, St. Petersburg, FL 33712' },
  venue_002:    { name: 'Old North East',        address: '725 2nd St N, Apt 1, St. Petersburg, FL 33701' },
  venue_online: { name: 'Online via Zoom',       address: null },
};
function resolveVenueLabel(venueId) {
  const v = VENUE_MAP[venueId];
  if (!v) return venueId;
  return v.address ? `${v.name}, ${v.address}` : v.name;
}

function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? hour + ':00 ' + period : hour + ':' + String(m).padStart(2, '0') + ' ' + period;
}

function bookingConfirmationHtml({ name, cls, formattedDate, paymentType, classesRemaining, formatPaymentType, bookingId }) {

  const isOnline = Boolean(cls.isOnline) && !cls.isHybrid;
  const isHybrid = Boolean(cls.isHybrid);

  const locationBlock = isOnline
    ? `
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Location</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">Online via Zoom</td>
      </tr>
      <tr style="background:${s.colorBgRow}; border-top:1px solid ${s.colorBorderLight};">
        <td colspan="2" style="padding:12px 20px;">
          <a href="${ZOOM_LINK}"
            style="display:inline-block; background:${s.colorPrimary}; color:white; padding:10px 24px;
                   border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
            Join Zoom Class →
          </a>
        </td>
      </tr>`
    : isHybrid
    ? `
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Location</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${resolveVenueLabel(cls.venue)}</td>
      </tr>
      <tr style="background:${s.colorBgRow}; border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Online</td>
        <td style="padding:10px 20px;">
          <a href="${ZOOM_LINK}"
            style="display:inline-block; background:${s.colorPrimary}; color:white; padding:10px 24px;
                   border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
            Join Zoom Class →
          </a>
        </td>
      </tr>`
    : `
      <tr style="border-top:1px solid ${s.colorBorderLight};">
        <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px; width:38%;">Location</td>
        <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${resolveVenueLabel(cls.venue)}</td>
      </tr>`;

  // QR check-in code — skipped for pure-online classes (no front desk to scan at).
  // Encodes "florium-checkin:<bookingId>"; the native app's scan screen checks
  // for that prefix before treating a decoded value as a booking id.
  const showQR = Boolean(bookingId) && !isOnline;
  const qrBlock = showQR
    ? `
      <tr style="background:${s.colorBgRow}; border-top:1px solid ${s.colorBorderLight};">
        <td colspan="2" style="padding:24px 20px; text-align:center;">
          <p style="margin:0 0 4px; font-size:11px; font-weight:600; color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Check-in code</p>
          <img src="${CHECKIN_QR_BASE}/${bookingId}/qr" width="140" height="140" alt="Check-in QR code"
               style="display:block; margin:12px auto 8px; width:140px; height:140px; border:1px solid ${s.colorBorder}; border-radius:8px;">
          <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">Show this at the front desk to check in</p>
        </td>
      </tr>`
    : "";

  const passBlock = classesRemaining !== null && classesRemaining !== undefined
    ? `<p style="margin:0 0 24px; font-size:13px; color:#6b6b8a;">
        You have <strong>${classesRemaining}</strong> class${classesRemaining !== 1 ? "es" : ""} remaining on your pass.
       </p>`
    : "";

  const bringBlock = isOnline
    ? `<div style="margin:0 0 24px; padding:16px 20px; background:${s.colorBgAccent}; border-left:3px solid ${s.colorCoral}; border-radius:0 6px 6px 0;"><p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Getting ready</p><p style="margin:0; font-size:13px; color:${s.colorTextBody}; line-height:1.7;">Mat, belt, and 2 bricks. For shoulder stand, 4–6 blankets are recommended. Your Zoom link is above — join a few minutes early to check your connection.</p></div>`
    : isHybrid
    ? `<div style="margin:0 0 24px; padding:16px 20px; background:${s.colorBgAccent}; border-left:3px solid ${s.colorCoral}; border-radius:0 6px 6px 0;"><p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">What to bring</p><p style="margin:0; font-size:13px; color:${s.colorTextBody}; line-height:1.7;">Mat, belt, and 2 bricks. For shoulder stand, 4–6 blankets are recommended — alternatives are offered if needed. This class is also available online via Zoom — your link is above.</p></div>`
    : `<div style="margin:0 0 24px; padding:16px 20px; background:${s.colorBgAccent}; border-left:3px solid ${s.colorCoral}; border-radius:0 6px 6px 0;"><p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">What to bring</p><p style="margin:0; font-size:13px; color:${s.colorTextBody}; line-height:1.7;">Mat, belt, and 2 bricks. For shoulder stand, 4–6 blankets are recommended — alternatives are offered if needed.</p></div>`;

  const manageBlock = bookingId
    ? `<p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.7;">
         Need to make a change?
         <a href="${MY_BOOKINGS}?reschedule=${bookingId}"
            style="color:${s.colorPrimary}; text-decoration:none;">Reschedule</a>
         &nbsp;·&nbsp;
         <a href="${MY_BOOKINGS}?cancel=${bookingId}"
            style="color:${s.colorPrimary}; text-decoration:none;">Cancel this booking</a>
       </p>`
    : `<p style="margin:16px 0 0; font-size:13px; color:${s.colorTextMuted}; line-height:1.7;">
         Need to cancel or make a change? Reply to this email or contact us at
         <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary}; text-decoration:none;">${STUDIO_EMAIL}</a>.
       </p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:${s.colorBgPage}; font-family:${s.fontFamily};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${s.colorBgPage}; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px; background:white; border-radius:12px;
               box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="background:${s.colorBgLight}; padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid ${s.colorBorder};">
              <div style="display:inline-block; padding:8px 20px; border:1px solid ${s.colorBorder};
                           border-radius:6px; color:${s.colorPrimary}; font-size:13px; letter-spacing:0.08em;
                           text-transform:uppercase;">Iyengar Yoga · St. Petersburg</div>
            </td>
          </tr>
          <tr>
            <td style="background:${s.colorPrimary}; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                         letter-spacing:0.14em; text-transform:uppercase;">Booking confirmed</p>
              <h1 style="margin:8px 0 0; color:white; font-size:26px; font-weight:300;
                          letter-spacing:0.03em;">You're booked!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
                Hi ${name.split(" ")[0]}, your spot is confirmed. See you on the mat!
              </p>
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
                <tr style="background:${s.colorBgRow}; border-top:1px solid ${s.colorBorderLight};">
                  <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Date</td>
                  <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${formattedDate}</td>
                </tr>
                <tr style="border-top:1px solid ${s.colorBorderLight};">
                  <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Time</td>
                  <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${formatTime(cls.time)} · ${cls.duration} min</td>
                </tr>
                ${locationBlock}
                <tr style="background:${s.colorBgRow}; border-top:1px solid ${s.colorBorderLight};">
                  <td style="padding:10px 20px; color:${s.colorTextMuted}; font-size:13px;">Payment</td>
                  <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${formatPaymentType(paymentType)}</td>
                </tr>
                ${qrBlock}
              </table>
              ${passBlock}
              ${bringBlock}
              <p style="margin:0; font-size:13px; color:${s.colorTextMuted}; line-height:1.7;">
                Need to cancel or have a question? Reply to this email or contact us at
                <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary}; text-decoration:none;">${STUDIO_EMAIL}</a>.
              </p>
              ${manageBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px; background:${s.colorBgPage}; text-align:center;
                        border-top:1px solid ${s.colorBorder};">
              <p style="margin:0 0 4px; font-size:12px; color:${s.colorTextMuted};">${STUDIO_NAME}</p>
              <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
                <a href="${PRICING_URL}" style="color:${s.colorPrimary}; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary}; text-decoration:none;">${STUDIO_EMAIL}</a>
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

module.exports = { bookingConfirmationHtml };
