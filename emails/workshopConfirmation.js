const PRICING_URL = process.env.PRICING_URL || "https://iy-sp.com/pricing";

 
function workshopConfirmationHtml({ name, workshopTitle, sessions, totalPrice, workshopId }) {
 
  const sessionRows = sessions.map((s, i) => {
    const bg = i % 2 === 0 ? "white" : "#fdfbfe";
    return `
    <tr style="background:${bg}; border-top:1px solid #f0eaf4;">
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${s.date}</td>
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${s.label}</td>
      <td style="padding:10px 20px; font-size:14px; color:#2d2d3e; white-space:nowrap;">${s.time}</td>
    </tr>`;
  }).join("");
 
  // Manage links — only shown if workshopId passed (future use)
  const manageBlock = workshopId
    ? `<p style="margin:20px 0 0; font-size:13px; color:#9b8fa8;">
         Need to make a change?
         <a href="mailto:info@iy-sp.com" style="color:#842953; text-decoration:none;">Contact us</a>
       </p>`
    : "";
 
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
 
          <!-- Logo pill -->
          <tr>
            <td style="background:#faf7fb; padding:28px 40px 20px; text-align:center;
                        border-bottom:1px solid #e8e0ec;">
              <div style="display:inline-block; padding:8px 20px; border:1px solid #e8e0ec;
                           border-radius:6px; color:#842953; font-size:13px; letter-spacing:0.08em;
                           text-transform:uppercase;">Iyengar Yoga · St. Petersburg</div>
            </td>
          </tr>
 
          <!-- Plum banner -->
          <tr>
            <td style="background:#842953; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                         letter-spacing:0.14em; text-transform:uppercase;">Booking confirmed</p>
              <h1 style="margin:8px 0 0; color:white; font-size:26px; font-weight:300;
                          letter-spacing:0.03em;">You're booked!</h1>
            </td>
          </tr>
 
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
 
              <p style="margin:0 0 24px; font-size:15px; color:#4a4a6a; line-height:1.6;">
                Hi ${name.split(" ")[0]}, your spot at <strong>${workshopTitle}</strong> is confirmed.
                We can't wait to see you!
              </p>
 
              <!-- Session table -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #e8e0ec; border-radius:8px; overflow:hidden; margin-bottom:24px;">
                <tr style="background:#faf7fb;">
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:#842953; letter-spacing:0.1em; text-transform:uppercase;">Your Sessions</td>
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:#842953; letter-spacing:0.1em; text-transform:uppercase;"></td>
                  <td style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:#842953; letter-spacing:0.1em; text-transform:uppercase;"></td>
                </tr>
                <tr style="border-top:1px solid #e8e0ec; background:#faf7fb;">
                  <td style="padding:8px 20px; font-size:11px; color:#9b8fa8; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Date</td>
                  <td style="padding:8px 20px; font-size:11px; color:#9b8fa8; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Session</td>
                  <td style="padding:8px 20px; font-size:11px; color:#9b8fa8; font-weight:600;
                              text-transform:uppercase; letter-spacing:0.06em;">Time</td>
                </tr>
                ${sessionRows}
                <tr style="border-top:1px solid #e8e0ec; background:#faf7fb;">
                  <td colspan="2" style="padding:12px 20px; font-size:13px; color:#6b6b8a;
                                          font-weight:500;">Total paid</td>
                  <td style="padding:12px 20px; font-size:15px; color:#842953;
                              font-weight:600;">$${totalPrice}</td>
                </tr>
              </table>
 
              <!-- What to bring -->
              <div style="margin:0 0 24px; padding:16px 20px; background:#fdf8ff;
                           border-left:3px solid #e58684; border-radius:0 6px 6px 0;">
                <p style="margin:0 0 6px; font-size:11px; font-weight:600; color:#842953;
                            letter-spacing:0.1em; text-transform:uppercase;">What to bring</p>
                <p style="margin:0; font-size:13px; color:#4a4a6a; line-height:1.7;">
                  Mat, belt, and 2 bricks. For shoulder stand, 4–6 blankets are recommended
                </p>
              </div>
 
              <!-- Contact / manage -->
              <p style="margin:0; font-size:13px; color:#9b8fa8; line-height:1.7;">
                Need to cancel or have a question? Reply to this email or contact us at
                <a href="mailto:info@iy-sp.com"
                   style="color:#842953; text-decoration:none;">info@iy-sp.com</a>.
              </p>
              ${manageBlock}
 
            </td>
          </tr>
 
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px; background:#f5f0f4; text-align:center;
                        border-top:1px solid #e8e0ec;">
              <p style="margin:0 0 4px; font-size:12px; color:#9b8fa8;">
                Iyengar Yoga St. Petersburg
              </p>
              <p style="margin:0; font-size:12px; color:#9b8fa8;">
                <a href="${PRICING_URL}"
                   style="color:#842953; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:info@iy-sp.com"
                   style="color:#842953; text-decoration:none;">info@iy-sp.com</a>
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
