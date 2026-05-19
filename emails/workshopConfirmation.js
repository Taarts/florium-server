const PRICING_URL = process.env.PRICING_URL || "${PRICING_URL}";
const STUDIO_NAME  = process.env.STUDIO_NAME  || "Florium Studio";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@florium.live";
const PRICING_URL  = process.env.PRICING_URL  || "https://florium.live/pricing";
const s            = require("./emailStyles");

 
function workshopConfirmationHtml({ name, workshopTitle, sessions, totalPrice, workshopId }) {
 
  const sessionRows = sessions.map((s, i) => {
    const bg = i % 2 === 0 ? "white" : "${s.colorBgLight}";
    return `
    <tr style="background:${bg}; border-top:1px solid ${s.colorBorder};">
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${s.date}</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark};">${s.label}</td>
      <td style="padding:10px 20px; font-size:14px; color:${s.colorTextDark}; white-space:nowrap;">${s.time}</td>
    </tr>`;
  }).join("");
 
  // Manage links — only shown if workshopId passed (future use)
  const manageBlock = workshopId
    ? `<p style="margin:20px 0 0; font-size:13px; color:${s.colorTextMuted};">
         Need to make a change?
         <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary}; text-decoration:none;">Contact us</a>
       </p>`
    : "";
 
  return `
<!DOCTYPE html>
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
 
          <!-- Logo pill -->
          <tr>
            <td style="background:${s.colorBgLight}; padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid ${s.colorBorder};">
              <div style="display:inline-block; padding:8px 20px; border:1px solid ${s.colorBorder};
                           border-radius:6px; color:${s.colorPrimary}; font-size:13px; letter-spacing:0.08em;
                           text-transform:uppercase;">Iyengar Yoga · St. Petersburg</div>
            </td>
          </tr>
 
          <!-- Plum banner -->
          <tr>
            <td style="background:${s.colorPrimary}; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                         letter-spacing:0.14em; text-transform:uppercase;">Booking confirmed</p>
              <h1 style="margin:8px 0 0; color:white; font-size:26px; font-weight:300;
                          letter-spacing:0.03em;">You're booked!</h1>
            </td>
          </tr>
 
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
 
              <p style="margin:0 0 24px; font-size:15px; color:${s.colorTextBody}; line-height:1.6;">
                Hi ${name.split(" ")[0]}, your spot at <strong>${workshopTitle}</strong> is confirmed.
                We can't wait to see you!
              </p>
 
              <!-- Session table -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid ${s.colorBorder}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
                <tr style="background:${s.colorBgLight};">
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;">Your Sessions</td>
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;"></td>
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:${s.colorPrimary}; letter-spacing:0.1em; text-transform:uppercase;"></td>
                </tr>
                <tr style="border-top:1px solid ${s.colorBorder}; background:${s.colorBgLight};">
                  <td style="padding:8px 20px; font-size:11px; color:${s.colorTextMuted}; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Date</td>
                  <td style="padding:8px 20px; font-size:11px; color:${s.colorTextMuted}; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Session</td>
                  <td style="padding:8px 20px; font-size:11px; color:${s.colorTextMuted}; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Time</td>
                </tr>
                ${sessionRows}
                <tr style="border-top:1px solid ${s.colorBorder}; background:${s.colorBgLight};">
                  <td colspan="2" style="padding:12px 20px; font-size:13px; color:#6b6b8a;
                                          font-weight:500;">Total paid</td>
                  <td style="padding:12px 20px; font-size:15px; color:${s.colorPrimary};
                              font-weight:600;">$${totalPrice}</td>
                </tr>
              </table>
 
              <!-- What to bring -->
              <div style="margin:0 0 24px; padding:16px 20px; background:${s.colorBgLight};
                           border-left:3px solid ${s.colorGold}; border-radius:0 6px 6px 0;">
                <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:${s.colorPrimary};
                            letter-spacing:0.1em; text-transform:uppercase;">What to bring</p>
                <p style="margin:0; font-size:13px; color:${s.colorTextBody}; line-height:1.7;">
                  Mat, belt, and 2 bricks. For shoulder stand, 4–6 blankets are recommended
                </p>
              </div>
 
              <!-- Contact / manage -->
              <p style="margin:0; font-size:13px; color:${s.colorTextMuted}; line-height:1.7;">
                Need to cancel or have a question? Reply to this email or contact us at
                <a href="mailto:${STUDIO_EMAIL}"
                   style="color:${s.colorPrimary}; text-decoration:none;">${STUDIO_EMAIL}</a>.
              </p>
              ${manageBlock}
 
            </td>
          </tr>
 
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px; background:${s.colorBgPage}; text-align:center;
                        border-top:1px solid ${s.colorBorder};">
              <p style="margin:0 0 4px; font-size:12px; color:${s.colorTextMuted};">
                ${STUDIO_NAME}
              </p>
              <p style="margin:0; font-size:12px; color:${s.colorTextMuted};">
                <a href="${PRICING_URL}"
                   style="color:${s.colorPrimary}; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${STUDIO_EMAIL}"
                   style="color:${s.colorPrimary}; text-decoration:none;">${STUDIO_EMAIL}</a>
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
 
module.exports = { workshopConfirmationHtml };
