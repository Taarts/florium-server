const PRICING_URL = process.env.PRICING_URL || 'https://iy-sp.com/pricing';
const CONTACT_EMAIL = 'info@iy-sp.com';

const PASS_LABELS = {
  pass4:     '4-Class Pass',
  pass8:     '8-Class Pass',
  member2x:  '2x Weekly Membership',
  memberUnl: 'Unlimited Membership',
  private1:  '1-Class Private Pass',
  private3:  '3-Class Private Pass',
  private10: '10-Class Private Pass',
};

function passReminderHtml({ studentName, passType, classesRemaining, expiresAt }) {
  const label = PASS_LABELS[passType] || passType;

  const expiryDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Build alert reasons
  const reasons = [];
  if (daysLeft !== null && daysLeft <= 14) reasons.push(`expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
  if (classesRemaining <= 2) reasons.push(`${classesRemaining} class${classesRemaining !== 1 ? 'es' : ''} remaining`);
  const reasonText = reasons.join(' and ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Pass — ${reasonText}</title>
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

          <!-- Banner -->
          <tr>
            <td style="background:#842953; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:rgba(255,255,255,0.75); font-size:11px;
                         letter-spacing:0.14em; text-transform:uppercase;">Pass update</p>
              <h1 style="margin:8px 0 0; color:white; font-size:24px; font-weight:300;
                          letter-spacing:0.03em;">Time to top up</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px; font-size:15px; color:#4a4a6a; line-height:1.6;">
                Hi ${studentName},
              </p>
              <p style="margin:0 0 24px; font-size:15px; color:#4a4a6a; line-height:1.6;">
                Just a heads up — your <strong>${label}</strong> is ${reasonText}. We'd love to keep seeing you on the mat!
              </p>

              <!-- Pass details -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #e8e0ec; border-radius:8px; overflow:hidden; margin-bottom:24px;">
                <tr style="background:#faf7fb;">
                  <td colspan="2" style="padding:12px 20px; font-size:11px; font-weight:600;
                      color:#842953; letter-spacing:0.1em; text-transform:uppercase;">Your Pass</td>
                </tr>
                <tr style="border-top:1px solid #e8e0ec;">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px; width:38%;">Type</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e; font-weight:500;">${label}</td>
                </tr>
                <tr style="background:#fdfbfe; border-top:1px solid #f0eaf4;">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Classes remaining</td>
                  <td style="padding:10px 20px; font-size:14px; color:#2d2d3e;">${classesRemaining}</td>
                </tr>
                ${expiryDate ? `
                <tr style="border-top:1px solid #f0eaf4;">
                  <td style="padding:10px 20px; color:#9b8fa8; font-size:13px;">Expires</td>
                  <td style="padding:10px 20px; font-size:14px; color:#c0392b;">${expiryDate}</td>
                </tr>` : ''}
              </table>

              <!-- CTA -->
              <div style="margin:0 0 24px; padding:16px 20px; background:#fdf8ff;
                           border-left:3px solid #e58684; border-radius:0 6px 6px 0;">
                <p style="margin:0 0 10px; font-size:14px; color:#3d2244; font-weight:600;">
                  Ready to renew?
                </p>
                <p style="margin:0 0 14px; font-size:14px; color:#4a4a6a; line-height:1.7;">
                  Visit our pricing page to purchase a new pass online, or reply to this email
                  to arrange payment directly — no processing fee.
                </p>
                <a href="${PRICING_URL}"
                   style="display:inline-block; background:#842953; color:white; padding:10px 24px;
                          border-radius:6px; text-decoration:none; font-size:14px; font-weight:500;">
                  View Passes &amp; Memberships →
                </a>
              </div>

              <p style="margin:0; font-size:13px; color:#9b8fa8; line-height:1.7;">
                Questions? Reply to this email or contact us at
                <a href="mailto:${CONTACT_EMAIL}" style="color:#842953; text-decoration:none;">${CONTACT_EMAIL}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px; background:#f5f0f4; text-align:center;
                        border-top:1px solid #e8e0ec;">
              <p style="margin:0 0 4px; font-size:12px; color:#9b8fa8;">Iyengar Yoga St. Petersburg</p>
              <p style="margin:0; font-size:12px; color:#9b8fa8;">
                <a href="${PRICING_URL}" style="color:#842953; text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${CONTACT_EMAIL}" style="color:#842953; text-decoration:none;">${CONTACT_EMAIL}</a>
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

module.exports = { passReminderHtml };