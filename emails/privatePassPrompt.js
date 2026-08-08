const STUDIO_NAME  = process.env.STUDIO_NAME  || "Florium Studio";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@florium.live";
const PRICING_URL  = process.env.PRICING_URL  || "https://florium.live/pricing";
const s            = require("./emailStyles");

/**
 * privatePassPromptHtml({ studentName, className, date, time, duration })
 *
 * Sent when admin tries to book a private class for a student
 * who has no active private pass. Lays out all pass options
 * with direct and Stripe prices, and invites them to reply to arrange payment.
 */

function privatePassPromptHtml({ studentName, className, date, time, duration }) {
  const dateObj = new Date(`${date}T12:00:00`);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

  const durationLabel = duration === 90 ? '1.5 hr' : `${duration} min`;

  const passRows = [
    { label: '1 × 1.5 hr private',  direct: '$129.00',  stripe: '$133.16' },
    { label: '3 × 1.5 hr privates', direct: '$387.00',  stripe: '$398.87' },
    { label: '3 × 1 hr privates',   direct: '$100.00',  stripe: '$103.30' },
    { label: '10 × 1 hr privates',  direct: '$880.00',  stripe: '$906.59' },
  ];

  const passTableRows = passRows.map((row, i) => `
    <tr style="background:${i % 2 === 0 ? '#fdf8fc' : '#ffffff'};">
      <td style="padding:10px 20px; font-size:14px; color:#3d2244; border-top:1px solid ${s.colorBorder};">${row.label}</td>
      <td style="padding:10px 20px; font-size:14px; color:#3d2244; border-top:1px solid ${s.colorBorder}; text-align:right; font-weight:600;">${row.direct}</td>
      <td style="padding:10px 20px; font-size:14px; color:#7a6882; border-top:1px solid ${s.colorBorder}; text-align:right;">${row.stripe} <span style="font-size:12px;">(via Stripe)</span></td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Private Class — Action Required</title>
</head>
<body style="margin:0; padding:0; background:#f7f0f5; font-family:Georgia, 'Times New Roman', serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f0f5; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(100,50,80,0.08);">

          <!-- Logo pill -->
          <tr>
            <td align="center" style="padding:32px 40px 0;">
              <div style="display:inline-block; border:1.5px solid ${s.colorPrimary}; border-radius:20px; padding:8px 24px;">
                <span style="font-family:Georgia, serif; font-size:13px; letter-spacing:0.12em; text-transform:uppercase; color:${s.colorPrimary};">${STUDIO_NAME}</span>
              </div>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding:28px 40px 0;">
              <div style="background:${s.colorPrimary}; border-radius:6px; padding:18px 28px;">
                <p style="margin:0; font-size:18px; color:#ffffff; font-family:Georgia, serif; letter-spacing:0.04em;">Private Class — Pass Required</p>
              </div>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:28px 40px 16px;">
              <p style="margin:0 0 16px; font-size:15px; color:#3d2244; line-height:1.7;">
                Hi ${studentName},
              </p>
              <p style="margin:0 0 16px; font-size:15px; color:#3d2244; line-height:1.7;">
                A private class has been reserved for you but is <strong>pending confirmation</strong> until a pass is in place. Once you've sorted payment, just let me know and I'll confirm your spot.
              </p>
            </td>
          </tr>

          <!-- Requested class details -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px; overflow:hidden; border:1px solid ${s.colorBorder};">
                <tr style="background:#fdf8fc;">
                  <td style="padding:10px 20px; font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#7a6882;">Class</td>
                  <td style="padding:10px 20px; font-size:14px; color:#3d2244; text-align:right; font-weight:600;">${className}</td>
                </tr>
                <tr style="background:#ffffff;">
                  <td style="padding:10px 20px; font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#7a6882; border-top:1px solid ${s.colorBorder};">Date</td>
                  <td style="padding:10px 20px; font-size:14px; color:#3d2244; text-align:right; border-top:1px solid ${s.colorBorder};">${formattedDate}</td>
                </tr>
                <tr style="background:#fdf8fc;">
                  <td style="padding:10px 20px; font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#7a6882; border-top:1px solid ${s.colorBorder};">Time</td>
                  <td style="padding:10px 20px; font-size:14px; color:#3d2244; text-align:right; border-top:1px solid ${s.colorBorder};">${formatTime(time)}</td>
                </tr>
                <tr style="background:#ffffff;">
                  <td style="padding:10px 20px; font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#7a6882; border-top:1px solid ${s.colorBorder};">Duration</td>
                  <td style="padding:10px 20px; font-size:14px; color:#3d2244; text-align:right; border-top:1px solid ${s.colorBorder};">${durationLabel}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pass options heading -->
          <tr>
            <td style="padding:0 40px 12px;">
              <p style="margin:0; font-size:15px; color:#3d2244; font-weight:600;">Private class pass options</p>
            </td>
          </tr>

          <!-- Pass pricing table -->
          <tr>
            <td style="padding:0 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px; overflow:hidden; border:1px solid ${s.colorBorder};">
                <tr style="background:${s.colorPrimary};">
                  <th style="padding:10px 20px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#ffffff; text-align:left; font-weight:600;">Pass</th>
                  <th style="padding:10px 20px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#ffffff; text-align:right; font-weight:600;">Direct</th>
                  <th style="padding:10px 20px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#ffffff; text-align:right; font-weight:600;">Online</th>
                </tr>
                ${passTableRows}
              </table>
              <p style="margin:8px 0 0; font-size:12px; color:#9a8aa4; line-height:1.5;">
                Online price includes Stripe processing fee. Direct payment saves the fee.
              </p>
            </td>
          </tr>

          <!-- How to pay block -->
          <tr>
            <td style="padding:20px 40px 24px;">
              <div style="border-left:3px solid ${s.colorGold}; padding:14px 18px; background:#fdf8fc; border-radius:0 6px 6px 0;">
                <p style="margin:0 0 10px; font-size:14px; color:#3d2244; font-weight:600;">How to pay</p>
                <p style="margin:0 0 8px; font-size:14px; color:#3d2244; line-height:1.7;">
                  <strong>Online (Stripe):</strong> Visit <a href="${PRICING_URL}" style="color:${s.colorPrimary};">${PRICING_URL}</a> to purchase a pass by card.
                </p>
                <p style="margin:0 0 8px; font-size:14px; color:#3d2244; line-height:1.7;">
                  <strong>Zelle / Venmo / cash:</strong> Reply to this email and we'll arrange it — no processing fee.
                </p>
                <p style="margin:0; font-size:14px; color:#3d2244; line-height:1.7;">
                  Questions? Just reply to <a href="mailto:${CONTACT_EMAIL}" style="color:${s.colorPrimary};">${CONTACT_EMAIL}</a>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px; border-top:1px solid ${s.colorBorder};">
              <p style="margin:0; font-size:13px; color:#9a8aa4; text-align:center; line-height:1.8;">
                ${STUDIO_NAME} &nbsp;·&nbsp;
                <a href="mailto:${CONTACT_EMAIL}" style="color:${s.colorPrimary}; text-decoration:none;">${CONTACT_EMAIL}</a>
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

module.exports = { privatePassPromptHtml };
