const mongoose = require('mongoose');
const env = require('fs').readFileSync('/var/www/florium-server/.env','utf8');
env.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k) process.env[k.trim()]=v.join('=').trim(); });
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Booking = require('./models/Booking');
  const bs = await Booking.find({status:'confirmed'}).limit(3).lean();
  console.log(JSON.stringify(bs.map(b => ({classId: b.classId, date: b.date})), null, 2));
  process.exit();
});
