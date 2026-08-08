const mongoose = require('/var/www/florium-server/node_modules/mongoose');

const MONGO_URI = 'mongodb+srv://REDACTED@florium-demo.nasiimz.mongodb.net/?appName=florium-demo';

const CLASSES = [
  { id: '69fa8e6fc7af4ba169d04f8e', title: 'Hatha Yoga',              teacher: 'Tricia Amheiser', rate: 7.50 },
  { id: '69fa8e6fc7af4ba169d04f8f', title: 'Yin & Meditation',        teacher: 'Tricia Amheiser', rate: 7.50 },
  { id: '69fa8e6fc7af4ba169d04f8c', title: 'Morning Flow Yoga',       teacher: 'Tricia Amheiser', rate: 7.50 },
  { id: '69fa8e6fc7af4ba169d04f91', title: 'Vinyasa Flow',            teacher: 'Maya Thornton',   rate: 7.00 },
  { id: '69fa8e6fc7af4ba169d04f90', title: 'Power Pilates',           teacher: 'Maya Thornton',   rate: 7.00 },
  { id: '69fa8e6fc7af4ba169d04f8d', title: 'Pilates Fundamentals',    teacher: 'Jordan Ellis',    rate: 6.50 },
  { id: '69fa8e6fc7af4ba169d04f92', title: 'Weekend Yoga — Online',   teacher: 'Jordan Ellis',    rate: 6.50 },
  { id: '69fa8e6fc7af4ba169d04f93', title: 'Sunday Meditation — Online', teacher: 'Sam Rivera',  rate: 6.00 },
];

const STUDENTS = [
  { name: 'Sarah Mitchell',   email: 'sarah.mitchell@gmail.com',   phone: '727-555-0101', city: 'St. Petersburg', state: 'FL', zip: '33701', isLocal: true,  waiverSigned: true },
  { name: 'James Okoye',      email: 'james.okoye@outlook.com',    phone: '727-555-0102', city: 'Tampa',          state: 'FL', zip: '33602', isLocal: true,  waiverSigned: true },
  { name: 'Priya Nair',       email: 'priya.nair@gmail.com',       phone: '813-555-0103', city: 'Clearwater',     state: 'FL', zip: '33755', isLocal: true,  waiverSigned: true },
  { name: 'Laura Chen',       email: 'laura.chen@icloud.com',      phone: '727-555-0104', city: 'St. Petersburg', state: 'FL', zip: '33704', isLocal: true,  waiverSigned: false },
  { name: 'Marcus Webb',      email: 'marcus.webb@yahoo.com',      phone: '212-555-0105', city: 'New York',       state: 'NY', zip: '10001', isLocal: false, waiverSigned: true },
  { name: 'Diane Holloway',   email: 'diane.holloway@gmail.com',   phone: '727-555-0106', city: 'St. Petersburg', state: 'FL', zip: '33705', isLocal: true,  waiverSigned: true },
  { name: 'Tom Reyes',        email: 'tom.reyes@gmail.com',        phone: '727-555-0107', city: 'Pinellas Park',  state: 'FL', zip: '33781', isLocal: true,  waiverSigned: true },
  { name: 'Amara Osei',       email: 'amara.osei@gmail.com',       phone: '404-555-0108', city: 'Atlanta',        state: 'GA', zip: '30301', isLocal: false, waiverSigned: true },
  { name: 'Rachel Ford',      email: 'rachel.ford@hotmail.com',    phone: '727-555-0109', city: 'St. Petersburg', state: 'FL', zip: '33710', isLocal: true,  waiverSigned: true },
  { name: 'Kevin Marsh',      email: 'kevin.marsh@gmail.com',      phone: '727-555-0110', city: 'Largo',          state: 'FL', zip: '33770', isLocal: true,  waiverSigned: false },
  { name: 'Nina Patel',       email: 'nina.patel@gmail.com',       phone: '727-555-0111', city: 'St. Petersburg', state: 'FL', zip: '33703', isLocal: true,  waiverSigned: true },
  { name: 'Chris Donovan',    email: 'chris.donovan@gmail.com',    phone: '727-555-0112', city: 'Dunedin',        state: 'FL', zip: '34698', isLocal: true,  waiverSigned: true },
  { name: 'Leila Hassan',     email: 'leila.hassan@outlook.com',   phone: '305-555-0113', city: 'Miami',          state: 'FL', zip: '33101', isLocal: false, waiverSigned: true },
  { name: 'Brett Calloway',   email: 'brett.calloway@yahoo.com',   phone: '727-555-0114', city: 'St. Petersburg', state: 'FL', zip: '33712', isLocal: true,  waiverSigned: true },
  { name: 'Yuki Tanaka',      email: 'yuki.tanaka@gmail.com',      phone: '206-555-0115', city: 'Seattle',        state: 'WA', zip: '98101', isLocal: false, waiverSigned: true },
];

const PASS_CONFIGS = [
  { email: 'sarah.mitchell@gmail.com',  type: 'pass8',     code: 'YOGA-DEMO01', total: 8,    used: 3,  daysUntilExp: 60  },
  { email: 'james.okoye@outlook.com',   type: 'member2x',  code: 'YOGA-DEMO02', total: null, used: 6,  daysUntilExp: null },
  { email: 'priya.nair@gmail.com',      type: 'pass4',     code: 'YOGA-DEMO03', total: 4,    used: 4,  daysUntilExp: 5   },
  { email: 'laura.chen@icloud.com',     type: 'dropin',    code: 'YOGA-DEMO04', total: 1,    used: 0,  daysUntilExp: null },
  { email: 'marcus.webb@yahoo.com',     type: 'pass8',     code: 'YOGA-DEMO05', total: 8,    used: 7,  daysUntilExp: 10  },
  { email: 'diane.holloway@gmail.com',  type: 'memberUnl', code: 'YOGA-DEMO06', total: null, used: 12, daysUntilExp: null },
  { email: 'tom.reyes@gmail.com',       type: 'pass4',     code: 'YOGA-DEMO07', total: 4,    used: 2,  daysUntilExp: 30  },
  { email: 'amara.osei@gmail.com',      type: 'dropin',    code: 'YOGA-DEMO08', total: 1,    used: 1,  daysUntilExp: null },
  { email: 'rachel.ford@hotmail.com',   type: 'pass8',     code: 'YOGA-DEMO09', total: 8,    used: 1,  daysUntilExp: 90  },
  { email: 'kevin.marsh@gmail.com',     type: 'pass4',     code: 'YOGA-DEMO10', total: 4,    used: 3,  daysUntilExp: 3   },
  { email: 'nina.patel@gmail.com',      type: 'pass8',     code: 'YOGA-DEMO11', total: 8,    used: 4,  daysUntilExp: 45  },
  { email: 'chris.donovan@gmail.com',   type: 'member2x',  code: 'YOGA-DEMO12', total: null, used: 8,  daysUntilExp: null },
  { email: 'leila.hassan@outlook.com',  type: 'pass4',     code: 'YOGA-DEMO13', total: 4,    used: 2,  daysUntilExp: 20  },
  { email: 'brett.calloway@yahoo.com',  type: 'memberUnl', code: 'YOGA-DEMO14', total: null, used: 15, daysUntilExp: null },
  { email: 'yuki.tanaka@gmail.com',     type: 'pass4',     code: 'YOGA-DEMO15', total: 4,    used: 1,  daysUntilExp: 25  },
];

// Spread bookings across teachers/classes
const BOOKING_SPECS = [
  // Tricia classes
  { email: 'sarah.mitchell@gmail.com',  name: 'Sarah Mitchell',  classIdx: 0, type: 'pass8',     daysAgo: 2,  checkedIn: true  },
  { email: 'james.okoye@outlook.com',   name: 'James Okoye',     classIdx: 0, type: 'member2x',  daysAgo: 2,  checkedIn: true  },
  { email: 'priya.nair@gmail.com',      name: 'Priya Nair',      classIdx: 0, type: 'pass4',     daysAgo: 2,  checkedIn: false },
  { email: 'nina.patel@gmail.com',      name: 'Nina Patel',      classIdx: 1, type: 'pass8',     daysAgo: 3,  checkedIn: true  },
  { email: 'brett.calloway@yahoo.com',  name: 'Brett Calloway',  classIdx: 1, type: 'memberUnl', daysAgo: 3,  checkedIn: true  },
  { email: 'rachel.ford@hotmail.com',   name: 'Rachel Ford',     classIdx: 1, type: 'pass8',     daysAgo: 3,  checkedIn: true  },
  { email: 'diane.holloway@gmail.com',  name: 'Diane Holloway',  classIdx: 2, type: 'memberUnl', daysAgo: 5,  checkedIn: true  },
  { email: 'tom.reyes@gmail.com',       name: 'Tom Reyes',       classIdx: 2, type: 'pass4',     daysAgo: 5,  checkedIn: true  },
  { email: 'kevin.marsh@gmail.com',     name: 'Kevin Marsh',     classIdx: 2, type: 'pass4',     daysAgo: 5,  checkedIn: false },
  { email: 'chris.donovan@gmail.com',   name: 'Chris Donovan',   classIdx: 0, type: 'member2x',  daysAgo: 9,  checkedIn: true  },
  { email: 'leila.hassan@outlook.com',  name: 'Leila Hassan',    name: 'Leila Hassan', classIdx: 2, type: 'pass4', daysAgo: 9, checkedIn: true },
  { email: 'yuki.tanaka@gmail.com',     name: 'Yuki Tanaka',     classIdx: 1, type: 'pass4',     daysAgo: 10, checkedIn: true  },

  // Maya classes
  { email: 'sarah.mitchell@gmail.com',  name: 'Sarah Mitchell',  classIdx: 3, type: 'pass8',     daysAgo: 4,  checkedIn: true  },
  { email: 'marcus.webb@yahoo.com',     name: 'Marcus Webb',     classIdx: 3, type: 'pass8',     daysAgo: 4,  checkedIn: true  },
  { email: 'nina.patel@gmail.com',      name: 'Nina Patel',      classIdx: 3, type: 'pass8',     daysAgo: 4,  checkedIn: true  },
  { email: 'brett.calloway@yahoo.com',  name: 'Brett Calloway',  classIdx: 4, type: 'memberUnl', daysAgo: 6,  checkedIn: true  },
  { email: 'diane.holloway@gmail.com',  name: 'Diane Holloway',  classIdx: 4, type: 'memberUnl', daysAgo: 6,  checkedIn: false },
  { email: 'james.okoye@outlook.com',   name: 'James Okoye',     classIdx: 4, type: 'member2x',  daysAgo: 6,  checkedIn: true  },
  { email: 'rachel.ford@hotmail.com',   name: 'Rachel Ford',     classIdx: 3, type: 'pass8',     daysAgo: 11, checkedIn: true  },
  { email: 'tom.reyes@gmail.com',       name: 'Tom Reyes',       classIdx: 4, type: 'pass4',     daysAgo: 11, checkedIn: true  },

  // Jordan classes
  { email: 'laura.chen@icloud.com',     name: 'Laura Chen',      classIdx: 5, type: 'dropin',    daysAgo: 1,  checkedIn: false },
  { email: 'amara.osei@gmail.com',      name: 'Amara Osei',      classIdx: 5, type: 'dropin',    daysAgo: 1,  checkedIn: true  },
  { email: 'chris.donovan@gmail.com',   name: 'Chris Donovan',   classIdx: 5, type: 'member2x',  daysAgo: 1,  checkedIn: true  },
  { email: 'yuki.tanaka@gmail.com',     name: 'Yuki Tanaka',     classIdx: 6, type: 'pass4',     daysAgo: 7,  checkedIn: true  },
  { email: 'leila.hassan@outlook.com',  name: 'Leila Hassan',    classIdx: 6, type: 'pass4',     daysAgo: 7,  checkedIn: true  },
  { email: 'kevin.marsh@gmail.com',     name: 'Kevin Marsh',     classIdx: 6, type: 'pass4',     daysAgo: 7,  checkedIn: true  },
  { email: 'nina.patel@gmail.com',      name: 'Nina Patel',      classIdx: 5, type: 'pass8',     daysAgo: 12, checkedIn: true  },

  // Sam classes
  { email: 'marcus.webb@yahoo.com',     name: 'Marcus Webb',     classIdx: 7, type: 'pass8',     daysAgo: 7,  checkedIn: true  },
  { email: 'diane.holloway@gmail.com',  name: 'Diane Holloway',  classIdx: 7, type: 'memberUnl', daysAgo: 7,  checkedIn: true  },
  { email: 'brett.calloway@yahoo.com',  name: 'Brett Calloway',  classIdx: 7, type: 'memberUnl', daysAgo: 7,  checkedIn: false },
  { email: 'sarah.mitchell@gmail.com',  name: 'Sarah Mitchell',  classIdx: 7, type: 'pass8',     daysAgo: 14, checkedIn: true  },
  { email: 'rachel.ford@hotmail.com',   name: 'Rachel Ford',     classIdx: 7, type: 'pass8',     daysAgo: 14, checkedIn: true  },

  // Cancelled bookings
  { email: 'priya.nair@gmail.com',      name: 'Priya Nair',      classIdx: 3, type: 'pass4',     daysAgo: 8,  checkedIn: false, status: 'cancelled' },
  { email: 'james.okoye@outlook.com',   name: 'James Okoye',     classIdx: 5, type: 'member2x',  daysAgo: 8,  checkedIn: false, status: 'cancelled' },
  { email: 'yuki.tanaka@gmail.com',     name: 'Yuki Tanaka',     classIdx: 7, type: 'pass4',     daysAgo: 13, checkedIn: false, status: 'cancelled' },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const Student = require('/var/www/florium-server/models/Student');
  const Pass    = require('/var/www/florium-server/models/Pass');
  const Booking = require('/var/www/florium-server/models/Booking');

  const emails = STUDENTS.map(s => s.email);
  await Student.deleteMany({ email: { $in: emails } });
  await Pass.deleteMany({ studentEmail: { $in: emails } });
  await Booking.deleteMany({ studentEmail: { $in: emails } });
  console.log('✓ Cleared existing demo data');

  const now = new Date();
  await Student.insertMany(STUDENTS.map((s, i) => ({
    ...s,
    firstVisit: new Date(now.getTime() - (30 - i * 2) * 24 * 60 * 60 * 1000),
    waiverSignedAt: s.waiverSigned ? new Date(now.getTime() - (28 - i) * 24 * 60 * 60 * 1000) : null,
  })));
  console.log(`✓ Inserted ${STUDENTS.length} students`);

  await Pass.insertMany(PASS_CONFIGS.map(p => ({
    code: p.code,
    type: p.type,
    studentEmail: p.email,
    classesTotal: p.total,
    classesUsed:  p.used,
    expiresAt:    p.daysUntilExp ? new Date(now.getTime() + p.daysUntilExp * 24*60*60*1000) : null,
    active:       true,
  })));
  console.log(`✓ Inserted ${PASS_CONFIGS.length} passes`);

  const bookings = BOOKING_SPECS.map(b => ({
    studentEmail: b.email,
    studentName:  b.name,
    classId:      CLASSES[b.classIdx].id,
    date:         daysAgo(b.daysAgo),
    paymentType:  b.type,
    status:       b.status ?? 'confirmed',
    checkedIn:    b.checkedIn,
    checkedInAt:  b.checkedIn ? new Date() : null,
  }));

  await Booking.insertMany(bookings, { ordered: false }).catch(e => {
    console.log(`⚠ Some bookings skipped: ${e.message.slice(0, 100)}`);
  });
  console.log(`✓ Inserted ${bookings.length} bookings`);

  console.log('\n✅ Seed complete');
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
