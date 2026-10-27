// Per-deployment pricing. Defaults are IY-SP's live prices. A deployment overrides any
// field with a committed config/pricing.<STUDIO_ID>.json (e.g. pricing.demo.json).
// Used by routes/passes.js (amount check + GET /api/passes/catalog),
// routes/membershipAgreement.js and email.js. Pass/membership ids are fixed across studios.
// display = advertised price (dollars). stripeAmount / actualCharge = what the card is charged
// (incl. any card-fee gross-up). Membership actualCharge must equal the Stripe Price amount.
const fs   = require("fs");
const path = require("path");
const { STUDIO_ID } = require("./studio");

const DEFAULTS = {
  passes: {
    dropin: { label: "Single Class", classes: 1, display: 25.00,  stripeAmount: 2606  },
    pass4:  { label: "4-Class Pass", classes: 4, display: 84.00,  stripeAmount: 8682  },
    pass8:  { label: "8-Class Pass", classes: 8, display: 152.00, stripeAmount: 15685 },
  },
  memberships: {
    member2x:  { label: "Committed", sub: "2 classes per week", display: 129.00, actualCharge: 133.16,
                 agreementLabel: "Committed Membership", agreementDescription: "allows me to take 2 classes per week at the Studio" },
    memberUnl: { label: "Monthly",   sub: "One class per day",  display: 169.00, actualCharge: 174.36,
                 agreementLabel: "Unlimited Membership", agreementDescription: "allows me to take unlimited classes at the Studio" },
  },
};

function load() {
  const file = path.join(__dirname, `pricing.${STUDIO_ID}.json`);
  if (!fs.existsSync(file)) return DEFAULTS;
  const over  = JSON.parse(fs.readFileSync(file, "utf8"));
  const merge = (base, o = {}) => Object.fromEntries(Object.keys(base).map(k => [k, { ...base[k], ...(o[k] || {}) }]));
  return { passes: merge(DEFAULTS.passes, over.passes), memberships: merge(DEFAULTS.memberships, over.memberships) };
}

module.exports = load();
