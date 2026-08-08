// ── ADD THIS TO server/emails/ as waiverConfirmation.js ──────────────────────
const STUDIO_NAME  = process.env.STUDIO_NAME  || "Florium Studio";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@florium.live";
const PRICING_URL  = process.env.PRICING_URL  || "https://florium.live/pricing";
const s            = require("./emailStyles");

function waiverConfirmationHtml({ studentName, signedAt }) {
  const firstName  = studentName.split(" ")[0];
  const formattedDate = new Date(signedAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${s.colorBgPage};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${s.colorBgPage};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:${s.colorBgLight};padding:28px 40px 20px;text-align:center;border-bottom:1px solid ${s.colorBorder};">
              <div style="display:inline-block;padding:8px 20px;border:1px solid ${s.colorBorder};border-radius:6px;color:${s.colorPrimary};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${STUDIO_NAME}</div>
            </td>
          </tr>
          <tr>
            <td style="background:${s.colorPrimary};padding:24px 40px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Liability Waiver</p>
              <h1 style="margin:8px 0 0;color:white;font-size:26px;font-weight:300;letter-spacing:0.03em;">Waiver signed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px;font-size:15px;color:${s.colorTextBody};line-height:1.6;">
                Hi ${firstName}, thank you for signing the ${STUDIO_NAME} liability waiver.
                Your signed copy is attached to this email for your records.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid ${s.colorBorder};border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <tr style="background:${s.colorBgLight};">
                  <td colspan="2" style="padding:12px 20px;font-size:11px;font-weight:600;color:${s.colorPrimary};letter-spacing:0.1em;text-transform:uppercase;">Waiver Details</td>
                </tr>
                <tr style="border-top:1px solid ${s.colorBorder};">
                  <td style="padding:10px 20px;color:${s.colorTextMuted};font-size:13px;width:38%;">Signed by</td>
                  <td style="padding:10px 20px;font-size:14px;color:${s.colorTextDark};font-weight:500;">${studentName}</td>
                </tr>
                <tr style="background: ${s.colorBgLight};border-top:1px solid ${s.colorBorder};">
                  <td style="padding:10px 20px;color:${s.colorTextMuted};font-size:13px;">Date</td>
                  <td style="padding:10px 20px;font-size:14px;color:${s.colorTextDark};">${formattedDate}</td>
                </tr>
                <tr style="border-top:1px solid ${s.colorBorder};">
                  <td style="padding:10px 20px;color:${s.colorTextMuted};font-size:13px;">Studio</td>
                  <td style="padding:10px 20px;font-size:14px;color:${s.colorTextDark};">${STUDIO_NAME}</td>
                </tr>
              </table>

              <div style="margin:20px 0;padding:16px 20px;background:${s.colorBgLight};border-left:3px solid ${s.colorGold};border-radius:0 6px 6px 0;">
                <p style="margin:0;font-size:13px;color:${s.colorTextBody};line-height:1.6;">
                  Your waiver remains on file for the duration of your enrollment.
                  You will not need to sign again for future classes.
                </p>
              </div>

              <p style="margin:16px 0 0;font-size:13px;color:#6b6b8a;line-height:1.6;">
                Questions? Contact us at
                <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary};text-decoration:none;">${STUDIO_EMAIL}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:${s.colorBgPage};text-align:center;border-top:1px solid ${s.colorBorder};">
              <p style="margin:0 0 4px;font-size:12px;color:${s.colorTextMuted};">${STUDIO_NAME}</p>
              <p style="margin:0;font-size:12px;color:${s.colorTextMuted};">
                <a href="${PRICING_URL}" style="color:${s.colorPrimary};text-decoration:none;">Passes &amp; Memberships</a>
                &nbsp;·&nbsp;
                <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary};text-decoration:none;">${STUDIO_EMAIL}</a>
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

module.exports = { waiverConfirmationHtml };


// ── ADD THIS FUNCTION TO server/email.js module.exports ──────────────────────
//
// const { waiverConfirmationHtml } = require('./emails/waiverConfirmation');
//
// async function sendWaiverEmail({ studentName, studentEmail, signedAt, pdfPath }) {
//   const html = waiverConfirmationHtml({ studentName, signedAt });
//   const attachments = pdfPath && fs.existsSync(pdfPath)
//     ? [{ filename: "liability-waiver.pdf", path: pdfPath }]
//     : [];
//
//   await resend.emails.send({
//     from:        FROM_EMAIL,
//     to:          studentEmail,
//     replyTo:     REPLY_TO,
//     subject:     `Your signed liability waiver — ${STUDIO_NAME}`,
//     html,
//     attachments, // Note: Resend supports attachments
//   });
//
//   // Also send copy to studio
//   await resend.emails.send({
//     from:    FROM_EMAIL,
//     to:      REPLY_TO,
//     subject: `Waiver signed — ${studentName} (${studentEmail})`,
//     html,
//     attachments,
//   });
//
//   console.log(`✓ Waiver email sent to ${studentEmail}`);
// }
//
// Add sendWaiverEmail to module.exports
