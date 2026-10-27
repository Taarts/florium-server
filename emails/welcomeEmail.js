"use strict";
const s = require("./emailStyles");

const STUDIO_NAME  = process.env.STUDIO_NAME  || "Iyengar Yoga St. Petersburg";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || "info@iy-sp.com";
const PRICING_URL  = process.env.PRICING_URL  || "https://iy-sp.com/pricing";
const MY_BOOKINGS  = process.env.MY_BOOKINGS_URL || "https://iy-sp.com/my-bookings";
const WAIVER_URL   = process.env.WAIVER_URL   || "https://iy-sp.com/waiver";
const CLASSES_URL  = process.env.CLASSES_URL  || "https://iy-sp.com/classes";

const PASS_LABELS = {
  dropin:    "Drop-in Class",
  pass4:     "4-Class Pass",
  pass8:     "8-Class Pass",
  member2x:  "Member 2x/week",
  memberUnl: "Monthly",
  private1:  "1 Private Session",
  private3:  "3 Private Sessions",
  private10: "10 Private Sessions",
};

function welcomeEmailHtml({ name, passType, classesTotal, expiresAt, passCode }) {
  const passLabel   = PASS_LABELS[passType] || passType;
  const isMember    = passType === "member2x" || passType === "memberUnl";
  const isPrivate   = passType && passType.startsWith("private");
  const firstName   = name ? name.split(" ")[0] : "there";

  const passRow = `
    <tr>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#555;border-top:1px solid ${s.colorBorderLight};width:40%;">Pass type</td>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#222;border-top:1px solid ${s.colorBorderLight};font-weight:600;">${passLabel}</td>
    </tr>`;

  const classesRow = (!isMember && !isPrivate && classesTotal) ? `
    <tr style="background:${s.colorBgRow};">
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#555;border-top:1px solid ${s.colorBorderLight};">Classes included</td>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#222;border-top:1px solid ${s.colorBorderLight};font-weight:600;">${classesTotal}</td>
    </tr>` : "";

  const memberClassesRow = isMember ? `
    <tr style="background:${s.colorBgRow};">
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#555;border-top:1px solid ${s.colorBorderLight};">Classes per week</td>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#222;border-top:1px solid ${s.colorBorderLight};font-weight:600;">${passType === "member2x" ? "2" : "Unlimited"}</td>
    </tr>` : "";

  const expiryRow = expiresAt ? `
    <tr>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#555;border-top:1px solid ${s.colorBorderLight};">Valid until</td>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#222;border-top:1px solid ${s.colorBorderLight};font-weight:600;">${new Date(expiresAt).toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })}</td>
    </tr>` : "";

  const passCodeRow = (passCode && !isMember) ? `
    <tr style="background:${s.colorBgRow};">
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:#555;border-top:1px solid ${s.colorBorderLight};">Your pass code</td>
      <td style="padding:10px 20px;font-family:Georgia,serif;font-size:14px;
                 color:${s.colorPrimary};border-top:1px solid ${s.colorBorderLight};font-weight:700;
                 letter-spacing:1px;">${passCode}</td>
    </tr>` : "";

  const waiverNote = `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid ${s.colorCoral};
                 font-family:Georgia,serif;font-size:14px;color:#444;line-height:1.6;">
        <strong style="color:#222;">Sign your waiver</strong> — if you haven't already,
        please <a href="${WAIVER_URL}" style="color:${s.colorPrimary};text-decoration:underline;">sign the liability waiver</a>
        before your first class.
      </td>
    </tr>
    <tr><td style="padding:4px 0;"></td></tr>`;

  const bookNote = `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid ${s.colorCoral};
                 font-family:Georgia,serif;font-size:14px;color:#444;line-height:1.6;">
        <strong style="color:#222;">Book your first class</strong> — head to the
        <a href="${CLASSES_URL}" style="color:${s.colorPrimary};text-decoration:underline;">class schedule</a>
        and pick a time that works for you.
      </td>
    </tr>
    <tr><td style="padding:4px 0;"></td></tr>`;

  const manageNote = isMember ? `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid ${s.colorCoral};
                 font-family:Georgia,serif;font-size:14px;color:#444;line-height:1.6;">
        <strong style="color:#222;">Manage your membership</strong> — update your card or
        cancel any time from
        <a href="${MY_BOOKINGS}" style="color:${s.colorPrimary};text-decoration:underline;">My Bookings</a>.
      </td>
    </tr>
    <tr><td style="padding:4px 0;"></td></tr>` : "";

  const passCodeNote = (passCode && !isMember) ? `
    <tr>
      <td style="padding:6px 0 6px 14px;border-left:3px solid ${s.colorCoral};
                 font-family:Georgia,serif;font-size:14px;color:#444;line-height:1.6;">
        <strong style="color:#222;">Your pass code is ${passCode}</strong> — enter it when
        booking to apply your classes. Keep this email handy.
      </td>
    </tr>
    <tr><td style="padding:4px 0;"></td></tr>` : "";

  return `
     <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;color:#444;line-height:1.7;">
      Welcome to your first class in your new yoga home, ${firstName}! We sincerely hope
      you enjoyed your class and look forward to having you back on the mat again.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;
           background:${s.colorBgLight};border:1px solid ${s.colorBorder};border-radius:6px;
           margin-bottom:28px;">
      <tbody>
        ${passRow}
        ${classesRow}
        ${memberClassesRow}
        ${expiryRow}
        ${passCodeRow}
      </tbody>
    </table>
    <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;
              color:#222;font-weight:600;">Getting started</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
      <tbody>
        ${waiverNote}
        ${bookNote}
        ${passCodeNote}
        ${manageNote}
      </tbody>
    </table>
    <p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#444;line-height:1.7;">
      If you have any questions, just reply to this email or reach us at
      <a href="mailto:${STUDIO_EMAIL}" style="color:${s.colorPrimary};text-decoration:underline;">${STUDIO_EMAIL}</a>.
      We look forward to seeing you on the mat.
    </p>`;
}

module.exports = { welcomeEmailHtml };
