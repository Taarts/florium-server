const ZOOM_LINK   = process.env.ZOOM_LINK;
const STUDIO_NAME  = process.env.STUDIO_NAME  || "Florium Studio";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@florium.live";
const PRICING_URL  = process.env.PRICING_URL  || "https://florium.live/pricing";
const MY_BOOKINGS  = process.env.MY_BOOKINGS_URL || "https://florium.live/my-bookings";
 
function bookingConfirmationHtml({ name, cls, formattedDate, paymentType, classesRemaining, formatPaymentType, bookingId }) {
 
  const locationBlock = cls.venue === "venue_online"
    ? `
      <tr style="border-top:1px solid #hsl(140, 12%, 78%);">
        <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Location</td>
        <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">Online via Zoom</td>
      </tr>
      <tr style="background:#hsl(140, 20%, 96%); border-top:1px solid #hsl(140, 12%, 78%);">
        <td colspan="2" style="padding:12px 20px;">
          <a href="${ZOOM_LINK}"
            style="display:inline-block; background:#1e5c3a; color:white; padding:10px 24px;
                   border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
            Join Zoom Class →
          </a>
        </td>
      </tr>`
    : `
      <tr style="border-top:1px solid #hsl(140, 12%, 78%);">
        <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Location</td>
        <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${cls.venue}</td>
      </tr>`;
 
  const passBlock = classesRemaining !== null && classesRemaining !== undefined
    ? `<p style="margin:0 0 24px; font-size:13px; color:#6b6b8a;">
        You have <strong>${classesRemaining}</strong> class${classesRemaining !== 1 ? "es" : ""} remaining on your pass.
       </p>`
    : "";
 
  const bringBlock = cls.venue === "venue_online"
    ? '<div style="margin:0 0 24px; padding:16px 20px; background:#hsl(140, 20%, 96%); border-left:3px solid #c9a84c; border-radius:0 6px 6px 0;"><p style="margin:0 0 6px; font-size:11px; font-weight:600; color:#1e5c3a; letter-spacing:0.1em; text-transform:uppercase;">Getting ready</p><p style="margin:0; font-size:13px; color:#4a4a6a; line-height:1.7;">Mat, belt, and 2 bricks. For shoulder stand, 4\u20136 blankets are recommended. Your Zoom link is above \u2014 join a few minutes early to check your connection.</p></div>'
    : '<div style="margin:0 0 24px; padding:16px 20px; background:#hsl(140, 20%, 96%); border-left:3px solid #c9a84c; border-radius:0 6px 6px 0;"><p style="margin:0 0 6px; font-size:11px; font-weight:600; color:#1e5c3a; letter-spacing:0.1em; text-transform:uppercase;">What to bring</p><p style="margin:0; font-size:13px; color:#4a4a6a; line-height:1.7;">Mat, belt, and 2 bricks. For shoulder stand, 4\u20136 blankets are recommended \u2014 alternatives are offered if needed.</p></div>';
 
  // Cancel / reschedule links — only shown when bookingId is available
  const manageBlock = bookingId
    ? `<p style="margin:16px 0 0; font-size:13px; color:#9b8fa8; line-height:1.7;">
         Need to make a change?
         <a href="${MY_BOOKINGS}?reschedule=${bookingId}"
            style="color:#1e5c3a; text-decoration:none;">Reschedule</a>
         &nbsp;·&nbsp;
         <a href="${MY_BOOKINGS}?cancel=${bookingId}"
            style="color:#1e5c3a; text-decoration:none;">Cancel this booking</a>
       </p>`
    : `<p style="margin:16px 0 0; font-size:13px; color:#9b8fa8; line-height:1.7;">
         Need to cancel or make a change? Reply to this email or contact us at
         <a href="mailto:${STUDIO_EMAIL}" style="color:#1e5c3a; text-decoration:none;">${STUDIO_EMAIL}</a>.
       </p>`;
 
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#hsl(140, 30%, 92%); font-family:'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#hsl(140, 30%, 92%); padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px; background:white; border-radius:12px;
               box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="background:#hsl(140, 20%, 96%); padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid #hsl(140, 12%, 78%);">
              <div style="display:inline-block; padding:8px 20px; border:1px solid #hsl(140, 12%, 78%);
                           border-radius:6px; color:#1e5c3a; font-size:13px; letter-spacing:0.08em;
                           text-transform:uppercase;">${STUDIO_NAME}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#1e5c3a; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                         letter-spacing:0.14em; text-transform:uppercase;">Booking confirmed</p>
              <h1 style="margin:8px 0 0; color:white; font-size:26px; font-weight:300;
                          letter-spacing:0.03em;">You're booked!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px; font-size:15px; color:#4a4a6a; line-height:1.6;">
                Hi ${name.split(" ")[0]}, your spot is confirmed. See you on the mat!
              </p>
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #hsl(140, 12%, 78%); border-radius:8px; overflow:hidden; margin-bottom:24px;">
                <tr style="background:#hsl(140, 20%, 96%);">
                  <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:#1e5c3a; letter-spacing:0.1em; text-transform:uppercase;">Class Details</td>
                </tr>
                <tr style="border-top:1px solid #hsl(140, 12%, 78%);">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Class</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e; font-weight:500;">${cls.title}</td>
                </tr>
                <tr style="background:#hsl(140, 20%, 96%); border-top:1px solid #hsl(140, 12%, 78%);">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Date</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${formattedDate}</td>
                </tr>
                <tr style="border-top:1px solid #hsl(140, 12%, 78%);">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Time</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${cls.time} · ${cls.duration} min</td>
                </tr>
                ${locationBlock}
                <tr style="background:#hsl(140, 20%, 96%); border-top:1px solid #hsl(140, 12%, 78%);">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Payment</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${formatPaymentType(paymentType)}</td>
                </tr>
              </table>
              ${passBlock}
              ${bringBlock}
              <p style="margin:0; font-size:13px; color:#9b8fa8; line-height:1.7;">
                Need to cancel or have a question? Reply to this email or contact us at
                <a href="mailto:${STUDIO_EMAIL}" style="color:#1e5c3a; text-decoration:none;">${STUDIO_EMAIL}</a>.
              </p>
              ${manageBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px; background:#hsl(140, 30%, 92%); text-align:center;
                        border-top:1px solid #hsl(140, 12%, 78%);">
              <p style="margin:0 0 4px; font-size:12px; color:#9b8fa8;">${STUDIO_NAME}</p>
              <p style="margin:0; font-size:12px; color:#9b8fa8;">
                <a href="${PRICING_URL}" style="color:#1e5c3a; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${STUDIO_EMAIL}" style="color:#1e5c3a; text-decoration:none;">${STUDIO_EMAIL}</a>
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
