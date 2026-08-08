// Membership types and their configuration.
// classesTotal resets to this value on each renewal (webhook handles it).
// null = unlimited classes.

module.exports = {
  member2x: {
    label:        "Member 2x/week",
    classesTotal: 9,   // ~2 classes/week over a month
    price:        59,  // USD, for display purposes
  },
  memberUnl: {
    label:        "Member Unlimited",
    classesTotal: null,
    price:        79,
  },
};