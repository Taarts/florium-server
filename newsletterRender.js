// Renders a block-based newsletter into email-safe HTML (tables + inline styles).
// mode "brevo"   → Brevo campaign tags ({{ unsubscribe }}, {{ mirror }}, {{ contact.FIRSTNAME }})
// mode "preview" → same layout with sample values, for the admin preview pane
const sanitizeHtml = require("sanitize-html");
const { renderSignature } = require("./signatureRender");

const ADDRESS   = process.env.STUDIO_ADDRESS || "6798 Crosswinds Dr N, D-106, St. Petersburg, FL 33710";
const FONT      = "Helvetica, Arial, sans-serif";
const SERIF     = "Georgia, 'Times New Roman', serif";
const TEXT      = "#333333";
const MUTED     = "#888888";
const PAGE_BG   = "#f4f1ee";
const CONTENT_W = 600;
const PAD       = 32;
const INNER_W   = CONTENT_W - PAD * 2;   // 536
const GUTTER    = 20;
const HALF_W    = (INNER_W - GUTTER) / 2; // 258

const BRANDS = {
  "iy-sp":    { title: "Iyengar Yoga · St. Petersburg", sender: "Iyengar Yoga St. Petersburg", color: "#7b2d55" },
  "flourish": { title: "Flourish Yoga & Wellness",      sender: "Flourish Yoga & Wellness",    color: "#7b2d55" },
  "all":      { title: "Iyengar Yoga · St. Petersburg", sender: "Iyengar Yoga St. Petersburg", color: "#7b2d55" },
};
// Deployments that aren't IY-SP/Flourish (e.g. the demo) take their brand from .env
{
  const id = require("./config/studio").STUDIO_ID;
  if (!BRANDS[id]) {
    const name = process.env.STUDIO_NAME || "Your Studio";
    BRANDS[id] = { title: name, sender: name, color: process.env.STUDIO_COLOR || "#2f4a3a" };
    BRANDS.all = BRANDS[id];
  }
}

// Studio list → that studio's brand; "All students" → the studio it was written in
function brandFor(nl) {
  const key = nl.audience && nl.audience !== "all" ? nl.audience : nl.brand;
  return BRANDS[key] || BRANDS.all;
}

const BLOCK_TYPES = ["heading", "text", "image", "imageText", "button", "divider", "spacer"];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(u) {
  const s = String(u ?? "").trim();
  return /^(https?:|mailto:|tel:)/i.test(s) ? s : "";
}

function safeColor(c, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? c : fallback;
}

function align(a) {
  return ["left", "center", "right"].includes(a) ? a : "left";
}

// ── Rich text: allow-list only, our own inline styles ─────
function richText(html, linkColor) {
  const pStyle  = `margin:0 0 14px; font-family:${FONT}; font-size:16px; line-height:1.6; color:${TEXT};`;
  const lStyle  = `margin:0 0 14px; padding-left:22px; font-family:${FONT}; font-size:16px; line-height:1.6; color:${TEXT};`;
  const liStyle = `margin:0 0 6px;`;
  const aStyle  = `color:${linkColor}; text-decoration:underline;`;
  const out = sanitizeHtml(String(html ?? ""), {
    allowedTags: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
    allowedAttributes: { a: ["href", "style", "target"], p: ["style"], ul: ["style"], ol: ["style"], li: ["style"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      div:    () => ({ tagName: "p",      attribs: { style: pStyle } }),
      p:      () => ({ tagName: "p",      attribs: { style: pStyle } }),
      b:      () => ({ tagName: "strong", attribs: {} }),
      strong: () => ({ tagName: "strong", attribs: {} }),
      i:      () => ({ tagName: "em",     attribs: {} }),
      em:     () => ({ tagName: "em",     attribs: {} }),
      ul:     () => ({ tagName: "ul",     attribs: { style: lStyle } }),
      ol:     () => ({ tagName: "ol",     attribs: { style: lStyle } }),
      li:     () => ({ tagName: "li",     attribs: { style: liStyle } }),
      a: (tag, attribs) => ({ tagName: "a", attribs: { href: safeUrl(attribs.href) || "#", style: aStyle, target: "_blank" } }),
    },
    // Drop blank paragraphs (contentEditable's <div><br></div>) — paragraph spacing is built in
    exclusiveFilter: frame => frame.tag === "p" && !frame.text.trim(),
  });
  // Text typed without paragraphs → wrap it so it gets styled
  if (out && !/^\s*<(p|ul|ol)\b/i.test(out)) return `<p style="${pStyle}">${out}</p>`;
  return out;
}

function row(inner, { top = 8, bottom = 8 } = {}) {
  return `<tr><td class="nl-pad" style="padding:${top}px ${PAD}px ${bottom}px;">${inner}</td></tr>`;
}

function imgTag(b, width, extraClass = "") {
  const src = safeUrl(b.src);
  if (!src) return "";
  const img = `<img src="${esc(src)}" alt="${esc(b.alt)}" width="${width}" class="nl-img ${extraClass}" style="display:block; width:100%; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none; border-radius:6px;">`;
  const href = safeUrl(b.href);
  return href ? `<a href="${esc(href)}" target="_blank">${img}</a>` : img;
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case "heading": {
      const size = b.level === 1 ? 28 : 21;
      const tag  = b.level === 1 ? "h1" : "h2";
      return row(`<${tag} style="margin:0; font-family:${SERIF}; font-size:${size}px; line-height:1.3; font-weight:normal; color:${ctx.headingColor}; text-align:${align(b.align)};">${esc(b.text)}</${tag}>`, { top: 16, bottom: 4 });
    }
    case "text":
      return row(richText(b.html, ctx.accent), { top: 8, bottom: 0 });
    case "image": {
      const img = imgTag(b, INNER_W);
      if (!img) return "";
      const cap = b.caption ? `<p style="margin:8px 0 0; font-family:${FONT}; font-size:13px; line-height:1.5; color:${MUTED}; text-align:center;">${esc(b.caption)}</p>` : "";
      return row(img + cap, { top: 12, bottom: 12 });
    }
    case "imageText": {
      if (b.imageSide === "top") {
        const img  = imgTag(b, INNER_W);
        const head = b.heading ? `<h3 style="margin:${img ? 16 : 0}px 0 10px; font-family:${SERIF}; font-size:19px; line-height:1.3; font-weight:normal; color:${ctx.headingColor};">${esc(b.heading)}</h3>` : "";
        const gap  = img && !head ? `<div style="height:16px; font-size:0; line-height:0;">&nbsp;</div>` : "";
        return row(img + head + gap + richText(b.html, ctx.accent), { top: 14, bottom: 6 });
      }
      const right  = b.imageSide === "right";
      const img    = imgTag(b, HALF_W) || `<div style="height:1px;"></div>`;
      const head   = b.heading ? `<h3 style="margin:0 0 10px; font-family:${SERIF}; font-size:19px; line-height:1.3; font-weight:normal; color:${ctx.headingColor};">${esc(b.heading)}</h3>` : "";
      const text   = head + richText(b.html, ctx.accent);
      const imgPad = right ? `0 0 0 ${GUTTER / 2}px` : `0 ${GUTTER / 2}px 0 0`;
      const txtPad = right ? `0 ${GUTTER / 2}px 0 0` : `0 0 0 ${GUTTER / 2}px`;
      // dir="rtl" puts the photo on the right on desktop while keeping it first when columns stack on phones
      return row(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${right ? "rtl" : "ltr"}">
  <tr>
    <td class="nl-col" width="50%" valign="top" dir="ltr" style="padding:${imgPad}; vertical-align:top;">${img}</td>
    <td class="nl-col" width="50%" valign="${b.valign === "middle" ? "middle" : "top"}" dir="ltr" style="padding:${txtPad}; vertical-align:${b.valign === "middle" ? "middle" : "top"}; text-align:left;">${text}</td>
  </tr>
</table>`, { top: 14, bottom: 14 });
    }
    case "button": {
      const href = safeUrl(b.url);
      if (!href || !b.label) return "";
      const a = align(b.align === "left" || b.align === "right" ? b.align : "center");
      return row(`
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${a}" style="margin:0 ${a === "center" ? "auto" : "0"};">
  <tr><td bgcolor="${ctx.accent}" style="border-radius:6px; background:${ctx.accent};">
    <a href="${esc(href)}" target="_blank" style="display:inline-block; padding:13px 30px; font-family:${FONT}; font-size:16px; font-weight:bold; line-height:1.2; color:#ffffff; text-decoration:none; border-radius:6px;">${esc(b.label)}</a>
  </td></tr>
</table>`, { top: 14, bottom: 14 });
    }
    case "divider":
      return row(`<div style="border-top:1px solid #e5e0db; font-size:0; line-height:0;">&nbsp;</div>`, { top: 16, bottom: 16 });
    case "spacer": {
      const h = [16, 32, 48].includes(Number(b.size)) ? Number(b.size) : 32;
      return `<tr><td style="height:${h}px; font-size:0; line-height:0;">&nbsp;</td></tr>`;
    }
    default:
      return "";
  }
}

function renderNewsletter(nl, { mode = "brevo", signature = null } = {}) {
  const brand   = brandFor(nl);
  const accent  = safeColor(nl.headerColor, brand.color);
  const title   = (nl.headerTitle || "").trim() || brand.title;
  const preview = mode === "preview";
  const ctx     = { accent, headingColor: accent };

  const unsub  = preview ? "#" : "{{ unsubscribe }}";
  const mirror = preview ? "#" : "{{ mirror }}";
  const first  = preview ? "Jane" : `{{ contact.FIRSTNAME | default : "there" }}`;

  const greeting = nl.greeting === false ? "" :
    row(`<p style="margin:0; font-family:${FONT}; font-size:16px; line-height:1.6; color:${TEXT};">Hi ${first},</p>`, { top: 8, bottom: 6 });

  const body = (Array.isArray(nl.blocks) ? nl.blocks : []).map(b => renderBlock(b, ctx)).join("\n");
  const sigHtml = renderSignature(signature, { accent });
  const sig = sigHtml ? row(sigHtml, { top: 0, bottom: 8 }) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(nl.subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .nl-wrap { width:100% !important; max-width:100% !important; border-radius:0 !important; }
    .nl-pad  { padding-left:20px !important; padding-right:20px !important; }
    .nl-col  { display:block !important; width:100% !important; padding:0 0 16px 0 !important; }
    .nl-img  { width:100% !important; max-width:100% !important; height:auto !important; }
    .nl-outer { padding:0 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG};">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${PAGE_BG};">${esc(nl.previewText || "")}&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
  <tr><td class="nl-outer" align="center" style="padding:24px 12px;">
    <table role="presentation" class="nl-wrap" width="${CONTENT_W}" cellpadding="0" cellspacing="0" border="0" style="width:${CONTENT_W}px; max-width:${CONTENT_W}px; background:#ffffff; border-radius:8px; overflow:hidden;">
      <tr><td style="padding:12px ${PAD}px; text-align:right; font-family:${FONT}; font-size:11px; color:${MUTED}; background:#ffffff;">
        <a href="${mirror}" target="_blank" style="color:${MUTED}; text-decoration:underline;">View in browser</a>
      </td></tr>
      <tr><td bgcolor="${accent}" style="background:${accent}; padding:30px ${PAD}px; text-align:center; font-family:${SERIF}; font-size:22px; letter-spacing:1px; color:#ffffff;">${esc(title)}</td></tr>
      <tr><td style="height:20px; font-size:0; line-height:0;">&nbsp;</td></tr>
      ${greeting}
      ${body}
      ${sig}
      <tr><td style="height:16px; font-size:0; line-height:0;">&nbsp;</td></tr>
      <tr><td class="nl-pad" style="padding:20px ${PAD}px 28px; border-top:1px solid #eeeae6; text-align:center; font-family:${FONT}; font-size:12px; line-height:1.6; color:${MUTED};">
        ${esc(brand.sender)} · ${ADDRESS}<br>
        You're receiving this because you've taken class with us.<br>
        <a href="${unsub}" target="_blank" style="color:${MUTED}; text-decoration:underline;">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Input cleaning for stored blocks (rendering re-sanitises) ──
function str(v, max = 2000) { return typeof v === "string" ? v.slice(0, max) : ""; }

function cleanBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 100).filter(b => b && BLOCK_TYPES.includes(b.type)).map(b => {
    const id = str(b.id, 40) || Math.random().toString(36).slice(2, 10);
    switch (b.type) {
      case "heading":   return { id, type: b.type, text: str(b.text, 300), level: b.level === 1 ? 1 : 2, align: align(b.align) };
      case "text":      return { id, type: b.type, html: str(b.html, 50000) };
      case "image":     return { id, type: b.type, src: str(b.src, 1000), alt: str(b.alt, 300), href: str(b.href, 1000), caption: str(b.caption, 300) };
      case "imageText": return { id, type: b.type, src: str(b.src, 1000), alt: str(b.alt, 300), href: str(b.href, 1000),
                                 heading: str(b.heading, 300), html: str(b.html, 50000),
                                 imageSide: ["left", "right", "top"].includes(b.imageSide) ? b.imageSide : "left", valign: b.valign === "middle" ? "middle" : "top" };
      case "button":    return { id, type: b.type, label: str(b.label, 100), url: str(b.url, 1000), align: align(b.align === "left" || b.align === "right" ? b.align : "center") };
      case "divider":   return { id, type: b.type };
      case "spacer":    return { id, type: b.type, size: [16, 32, 48].includes(Number(b.size)) ? Number(b.size) : 32 };
      default:          return null;
    }
  }).filter(Boolean);
}

module.exports = { renderNewsletter, cleanBlocks, BRANDS, BLOCK_TYPES, brandFor };
