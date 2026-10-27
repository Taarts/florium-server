// Usage (repo root):
//   node scripts/create-user.js <email> "<Name>" [owner|teacher] [iy-sp,flourish]
//   node scripts/create-user.js <email> --reset        → new random password, revokes tokens
require("dotenv").config();
const crypto   = require("crypto");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");

(async () => {
  const [email, nameOrFlag, role = "owner", studiosArg = "iy-sp,flourish"] = process.argv.slice(2);
  if (!email || !nameOrFlag) {
    console.error('Usage: node scripts/create-user.js <email> "<Name>" [owner|teacher] [iy-sp,flourish]\n       node scripts/create-user.js <email> --reset');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.error("No MONGO_URI / MONGODB_URI in .env"); process.exit(1); }

  await mongoose.connect(uri);
  const e            = email.trim().toLowerCase();
  const password     = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  if (nameOrFlag === "--reset") {
    const u = await User.findOneAndUpdate({ email: e }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } }, { new: true });
    if (!u) { console.error(`No user ${e}`); process.exit(1); }
  } else {
    if (await User.exists({ email: e })) { console.error(`${e} already exists. Use --reset.`); process.exit(1); }
    await User.create({ email: e, name: nameOrFlag, role, studios: studiosArg.split(","), passwordHash });
  }

  console.log(`\n  ${e} (${nameOrFlag === "--reset" ? "reset" : role})\n  password: ${password}\n\n  Save this now. It is not stored anywhere.\n`);
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
