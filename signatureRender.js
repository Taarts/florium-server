// Email signatures: one consistent, email-safe layout used by Newsletters and Messages.
const FONT  = "Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const TEXT  = "#333333";
const MUTED = "#777777";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function websiteHref(w) {
  const s = String(w || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function websiteText(w) {
  return String(w || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function renderSignature(sig, { accent = "#7b2d55" } = {}) {
  if (!sig || !sig.name) return "";
  const photo = /^https?:\/\//i.test(sig.photo || "") ? sig.photo : "";
  const link  = `color:${accent}; text-decoration:none;`;

  const contact = [
    sig.phone   && `<a href="tel:${esc(String(sig.phone).replace(/[^\d+]/g, ""))}" style="${link}">${esc(sig.phone)}</a>`,
    sig.email   && `<a href="mailto:${esc(sig.email)}" style="${link}">${esc(sig.email)}</a>`,
    sig.website && `<a href="${esc(websiteHref(sig.website))}" target="_blank" style="${link}">${esc(websiteText(sig.website))}</a>`,
  ].filter(Boolean).join(`<span style="color:#cccccc;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);

  const signOff = sig.signOff
    ? `<p style="margin:0 0 14px; font-family:${FONT}; font-size:16px; line-height:1.5; color:${TEXT};">${esc(sig.signOff)}</p>`
    : "";

  const photoCell = photo
    ? `<td valign="top" style="padding:0 14px 0 0; vertical-align:top;">
         <img src="${esc(photo)}" alt="${esc(sig.name)}" width="64" height="64" style="display:block; width:64px; height:64px; border-radius:50%; border:0; object-fit:cover;">
       </td>`
    : "";

  return `
<div style="margin:24px 0 8px;">
  ${signOff}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      ${photoCell}
      <td valign="top" style="vertical-align:top; padding:2px 0 0 ${photo ? 0 : 12}px; ${photo ? "" : `border-left:3px solid ${accent};`}">
        <p style="margin:0; font-family:${SERIF}; font-size:17px; line-height:1.3; color:${TEXT};">${esc(sig.name)}</p>
        ${sig.title ? `<p style="margin:2px 0 0; font-family:${FONT}; font-size:13px; line-height:1.4; color:${MUTED};">${esc(sig.title)}</p>` : ""}
        ${contact ? `<p style="margin:6px 0 0; font-family:${FONT}; font-size:13px; line-height:1.5; color:${MUTED};">${contact}</p>` : ""}
      </td>
    </tr>
  </table>
</div>`;
}

// Teacher images are stored relative to the API base ("/uploads/images/x.jpg")
function absUrl(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const base = (process.env.PUBLIC_API_URL || "https://iy-sp.com/api").replace(/\/$/, "");
  return base + (s.startsWith("/") ? "" : "/") + s;
}

// "Me": the signed-in person (req.user) or a newsletter's author (createdBy)
async function personalSignature(author) {
  if (!author) return null;
  const User    = require("./models/User");
  const Teacher = require("./models/Teacher");
  let teacherId = author.teacherId || null;
  const uid = String(author.userId || author.id || "");
  if (!teacherId && /^[a-f0-9]{24}$/.test(uid)) {
    const u = await User.findById(uid, "teacherId").lean();
    teacherId = u?.teacherId || null;
  }
  const t = teacherId ? await Teacher.findById(teacherId, "name email image").lean() : null;
  const name = t?.name || author.name;
  if (!name) return null;
  return {
    signOff: "Warmly,",
    name,
    title:   author.role === "teacher" ? "Teacher" : "",
    photo:   absUrl(t?.image),
    email:   t?.email || author.email || "",
  };
}

// signatureId: "default" | "me" | "none" | <ObjectId string>
async function getSignature(signatureId = "default", author = null) {
  const Signature = require("./models/Signature");
  if (signatureId === "none") return null;
  if (signatureId === "me") {
    const me = await personalSignature(author);
    if (me) return me;   // no author info → studio default below
  }
  if (signatureId && signatureId !== "default" && /^[a-f0-9]{24}$/.test(signatureId)) {
    const s = await Signature.findById(signatureId).lean();
    if (s) return s;
  }
  return Signature.findOne({ isDefault: true }).lean();
}

async function signatureHtmlFor(signatureId, opts, author = null) {
  return renderSignature(await getSignature(signatureId, author), opts);
}

module.exports = { renderSignature, getSignature, signatureHtmlFor };
