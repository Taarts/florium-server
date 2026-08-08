const dns = require("dns").promises;

// Reasonably strict, not full RFC 5322 — good enough for real-world signup forms
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function validateEmail(rawEmail) {
  const email = (rawEmail || "").trim();

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: "Please enter a valid email address." };
  }

  const domain = email.split("@")[1].toLowerCase();

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: "That email domain can't receive mail — please check for typos." };
    }
    return { valid: true, email };
  } catch (err) {
    // ENOTFOUND / ENODATA — domain doesn't exist or has no mail server
    return { valid: false, reason: "That email domain doesn't seem to exist — please check for typos." };
  }
}

module.exports = { validateEmail };