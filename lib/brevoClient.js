// One Brevo client for the whole server. In DEMO_MODE it's a stand-in that logs
// every call and sends nothing (transactional email, campaigns, lists, gallery).
const { DEMO_MODE } = require("../config/studio");

function summarize(args) {
  const a = args && args[0];
  if (!a || typeof a !== "object") return "";
  const to = Array.isArray(a.to) ? a.to.map(t => t && t.email).filter(Boolean).join(", ") : "";
  return [to && `to=${to}`, a.subject && `subject="${a.subject}"`].filter(Boolean).join(" ");
}

function demoStub(path = []) {
  return new Proxy(function () {}, {
    get(_t, key) {
      if (key === "then") return undefined; // never look like a promise
      return demoStub([...path, String(key)]);
    },
    apply(_t, _this, args) {
      console.log(`✉ email suppressed (DEMO_MODE): brevo.${path.join(".")} ${summarize(args)}`);
      return Promise.resolve({
        id: 0, messageId: "demo-suppressed", lists: [], folders: [], count: 0,
        totalSubscribers: 0, uniqueSubscribers: 0, statistics: { globalStats: {} }, status: "draft",
      });
    },
  });
}

if (DEMO_MODE) {
  module.exports = demoStub();
} else {
  const { BrevoClient } = require("@getbrevo/brevo");
  module.exports = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
}
