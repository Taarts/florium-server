// Class start times are stored as studio wall-clock ("YYYY-MM-DD" + "HH:MM").
// The VPS runs on UTC, so `new Date("2026-10-20T09:00:00")` would read 09:00 as UTC
// and put every class 4–5 hours early. classStart() converts using the studio's time zone.
const TZ = process.env.STUDIO_TZ || "America/New_York";

function classStart(date, time = "00:00") {
  const guess = new Date(`${date}T${time}:00Z`);
  if (isNaN(guess)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUTC  = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = asUTC - guess.getTime(); // studio time minus UTC, in ms
  return new Date(guess.getTime() - offset);
}

function minutesUntil(date, time) {
  const start = classStart(date, time);
  return start ? (start.getTime() - Date.now()) / 60000 : null;
}

module.exports = { classStart, minutesUntil, TZ };
