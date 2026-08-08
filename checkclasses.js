const mongoose = require('mongoose');
const env = require('fs').readFileSync('/var/www/florium-server/.env','utf8');
env.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k) process.env[k.trim()]=v.join('=').trim(); });
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Class = require('./models/Class');
  const cs = await Class.find({}).lean();
  console.log(JSON.stringify(cs.map(c => ({id: c.id, title: c.title, dayOfWeek: c.dayOfWeek})), null, 2));
  process.exit();
});
