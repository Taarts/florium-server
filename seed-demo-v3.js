const mongoose = require('/var/www/florium-server/node_modules/mongoose');

const MONGO_URI = process.env.MONGODB_URI;

const CLASSES = [
  { id: '69fa8e6fc7af4ba169d04f8e', title: 'Hatha Yoga',               teacher: 'Tricia Amheiser', rate: 7.50, ceiling: 75 },
  { id: '69fa8e6fc7af4ba169d04f8f', title: 'Yin & Meditation',         teacher: 'Tricia Amheiser', rate: 7.50, ceiling: 75 },
  { id: '69fa8e6fc7af4ba169d04f8c', title: 'Morning Flow Yoga',        teacher: 'Tricia Amheiser', rate: 7.50, ceiling: 75 },
  { id: '69fa8e6fc7af4ba169d04f91', title: 'Vinyasa Flow',             teacher: 'Maya Thornton',   rate: 7.00, ceiling: 70 },
  { id: '69fa8e6fc7af4ba169d04f90', title: 'Power Pilates',            teacher: 'Maya Thornton',   rate: 7.00, ceiling: 70 },
  { id: '69fa8e6fc7af4ba169d04f8d', title: 'Pilates Fundamentals',     teacher: 'Jordan Ellis',    rate: 6.50, ceiling: 65 },
  { id: '69fa8e6fc7af4ba169d04f92', title: 'Weekend Yoga — Online',    teacher: 'Jordan Ellis',    rate: 6.50, ceiling: 65 },
  { id: '69fa8e6fc7af4ba169d04f93', title: 'Sunday Meditation — Online', teacher: 'Sam Rivera',   rate: 6.00, ceiling: 60 },
];

const STUDENTS = [
  { name: 'Sarah Mitchell',    email: 'sarah.mitchell@gmail.com',    city: 'St. Petersburg', state: 'FL', zip: '33701', isLocal: true,  waiverSigned: true  },
  { name: 'James Okoye',       email: 'james.okoye@outlook.com',     city: 'Tampa',          state: 'FL', zip: '33602', isLocal: true,  waiverSigned: true  },
  { name: 'Priya Nair',        email: 'priya.nair@gmail.com',        city: 'Clearwater',     state: 'FL', zip: '33755', isLocal: true,  waiverSigned: true  },
  { name: 'Laura Chen',        email: 'laura.chen@icloud.com',       city: 'St. Petersburg', state: 'FL', zip: '33704', isLocal: true,  waiverSigned: false },
  { name: 'Marcus Webb',       email: 'marcus.webb@yahoo.com',       city: 'New York',       state: 'NY', zip: '10001', isLocal: false, waiverSigned: true  },
  { name: 'Diane Holloway',    email: 'diane.holloway@gmail.com',    city: 'St. Petersburg', state: 'FL', zip: '33705', isLocal: true,  waiverSigned: true  },
  { name: 'Tom Reyes',         email: 'tom.reyes@gmail.com',         city: 'Pinellas Park',  state: 'FL', zip: '33781', isLocal: true,  waiverSigned: true  },
  { name: 'Amara Osei',        email: 'amara.osei@gmail.com',        city: 'Atlanta',        state: 'GA', zip: '30301', isLocal: false, waiverSigned: true  },
  { name: 'Rachel Ford',       email: 'rachel.ford@hotmail.com',     city: 'St. Petersburg', state: 'FL', zip: '33710', isLocal: true,  waiverSigned: true  },
  { name: 'Kevin Marsh',       email: 'kevin.marsh@gmail.com',       city: 'Largo',          state: 'FL', zip: '33770', isLocal: true,  waiverSigned: false },
  { name: 'Nina Patel',        email: 'nina.patel@gmail.com',        city: 'St. Petersburg', state: 'FL', zip: '33703', isLocal: true,  waiverSigned: true  },
  { name: 'Chris Donovan',     email: 'chris.donovan@gmail.com',     city: 'Dunedin',        state: 'FL', zip: '34698', isLocal: true,  waiverSigned: true  },
  { name: 'Leila Hassan',      email: 'leila.hassan@outlook.com',    city: 'Miami',          state: 'FL', zip: '33101', isLocal: false, waiverSigned: true  },
  { name: 'Brett Calloway',    email: 'brett.calloway@yahoo.com',    city: 'St. Petersburg', state: 'FL', zip: '33712', isLocal: true,  waiverSigned: true  },
  { name: 'Yuki Tanaka',       email: 'yuki.tanaka@gmail.com',       city: 'Seattle',        state: 'WA', zip: '98101', isLocal: false, waiverSigned: true  },
  { name: 'Sofia Reyes',       email: 'sofia.reyes@gmail.com',       city: 'St. Petersburg', state: 'FL', zip: '33711', isLocal: true,  waiverSigned: true  },
  { name: 'Patrick Nguyen',    email: 'patrick.nguyen@gmail.com',    city: 'Clearwater',     state: 'FL', zip: '33760', isLocal: true,  waiverSigned: true  },
  { name: 'Dana Cross',        email: 'dana.cross@icloud.com',       city: 'Tampa',          state: 'FL', zip: '33606', isLocal: true,  waiverSigned: false },
  { name: 'Omar Sharif',       email: 'omar.sharif@outlook.com',     city: 'Chicago',        state: 'IL', zip: '60601', isLocal: false, waiverSigned: true  },
  { name: 'Cleo Baptiste',     email: 'cleo.baptiste@gmail.com',     city: 'St. Petersburg', state: 'FL', zip: '33708', isLocal: true,  waiverSigned: true  },
  { name: 'Ravi Mehta',        email: 'ravi.mehta@gmail.com',        city: 'Seminole',       state: 'FL', zip: '33772', isLocal: true,  waiverSigned: true  },
  { name: 'Fiona Walsh',       email: 'fiona.walsh@hotmail.com',     city: 'St. Petersburg', state: 'FL', zip: '33702', isLocal: true,  waiverSigned: true  },
  { name: 'Jake Moreno',       email: 'jake.moreno@gmail.com',       city: 'Gulfport',       state: 'FL', zip: '33707', isLocal: true,  waiverSigned: false },
  { name: 'Tanya Obi',         email: 'tanya.obi@gmail.com',         city: 'St. Petersburg', state: 'FL', zip: '33713', isLocal: true,  waiverSigned: true  },
  { name: 'Elliot Barnes',     email: 'elliot.barnes@yahoo.com',     city: 'Denver',         state: 'CO', zip: '80201', isLocal: false, waiverSigned: true  },
];

// Pass type per student — determines what they book with
const STUDENT_PASS = {
  'sarah.mitchell@gmail.com':   { type: 'pass8',     code: 'YOGA-D001', total: 8,    used: 5,  daysExp: 45  },
  'james.okoye@outlook.com':    { type: 'member2x',  code: 'YOGA-D002', total: null, used: 14, daysExp: null },
  'priya.nair@gmail.com':       { type: 'pass4',     code: 'YOGA-D003', total: 4,    used: 4,  daysExp: 5   },
  'laura.chen@icloud.com':      { type: 'dropin',    code: 'YOGA-D004', total: 1,    used: 0,  daysExp: null },
  'marcus.webb@yahoo.com':      { type: 'pass8',     code: 'YOGA-D005', total: 8,    used: 7,  daysExp: 10  },
  'diane.holloway@gmail.com':   { type: 'memberUnl', code: 'YOGA-D006', total: null, used: 18, daysExp: null },
  'tom.reyes@gmail.com':        { type: 'pass4',     code: 'YOGA-D007', total: 4,    used: 2,  daysExp: 30  },
  'amara.osei@gmail.com':       { type: 'dropin',    code: 'YOGA-D008', total: 1,    used: 1,  daysExp: null },
  'rachel.ford@hotmail.com':    { type: 'pass8',     code: 'YOGA-D009', total: 8,    used: 2,  daysExp: 80  },
  'kevin.marsh@gmail.com':      { type: 'pass4',     code: 'YOGA-D010', total: 4,    used: 3,  daysExp: 3   },
  'nina.patel@gmail.com':       { type: 'pass8',     code: 'YOGA-D011', total: 8,    used: 4,  daysExp: 50  },
  'chris.donovan@gmail.com':    { type: 'member2x',  code: 'YOGA-D012', total: null, used: 9,  daysExp: null },
  'leila.hassan@outlook.com':   { type: 'pass4',     code: 'YOGA-D013', total: 4,    used: 2,  daysExp: 20  },
  'brett.calloway@yahoo.com':   { type: 'memberUnl', code: 'YOGA-D014', total: null, used: 22, daysExp: null },
  'yuki.tanaka@gmail.com':      { type: 'pass4',     code: 'YOGA-D015', total: 4,    used: 1,  daysExp: 25  },
  'sofia.reyes@gmail.com':      { type: 'pass8',     code: 'YOGA-D016', total: 8,    used: 3,  daysExp: 60  },
  'patrick.nguyen@gmail.com':   { type: 'pass4',     code: 'YOGA-D017', total: 4,    used: 1,  daysExp: 40  },
  'dana.cross@icloud.com':      { type: 'dropin',    code: 'YOGA-D018', total: 1,    used: 0,  daysExp: null },
  'omar.sharif@outlook.com':    { type: 'pass4',     code: 'YOGA-D019', total: 4,    used: 2,  daysExp: 15  },
  'cleo.baptiste@gmail.com':    { type: 'memberUnl', code: 'YOGA-D020', total: null, used: 11, daysExp: null },
  'ravi.mehta@gmail.com':       { type: 'pass8',     code: 'YOGA-D021', total: 8,    used: 6,  daysExp: 35  },
  'fiona.walsh@hotmail.com':    { type: 'member2x',  code: 'YOGA-D022', total: null, used: 7,  daysExp: null },
  'jake.moreno@gmail.com':      { type: 'dropin',    code: 'YOGA-D023', total: 1,    used: 1,  daysExp: null },
  'tanya.obi@gmail.com':        { type: 'pass4',     code: 'YOGA-D024', total: 4,    used: 0,  daysExp: 55  },
  'elliot.barnes@yahoo.com':    { type: 'pass8',     code: 'YOGA-D025', total: 8,    used: 3,  daysExp: 70  },
};

// Classes per session with student rosters — 6-20 students each
// classIdx matches CLASSES array, daysAgo spreads across last 2 weeks
const SESSIONS = [
  // Tricia — Hatha Yoga (classIdx 0)
  { classIdx: 0, daysAgo: 2,  students: [
    'sarah.mitchell@gmail.com', 'james.okoye@outlook.com', 'priya.nair@gmail.com',
    'nina.patel@gmail.com', 'brett.calloway@yahoo.com', 'rachel.ford@hotmail.com',
    'sofia.reyes@gmail.com', 'ravi.mehta@gmail.com', 'cleo.baptiste@gmail.com',
    'fiona.walsh@hotmail.com', 'tanya.obi@gmail.com', 'elliot.barnes@yahoo.com',
  ], cancelled: ['priya.nair@gmail.com'] },

  { classIdx: 0, daysAgo: 9, students: [
    'sarah.mitchell@gmail.com', 'james.okoye@outlook.com', 'diane.holloway@gmail.com',
    'chris.donovan@gmail.com', 'leila.hassan@outlook.com', 'tom.reyes@gmail.com',
    'nina.patel@gmail.com', 'patrick.nguyen@gmail.com',
  ], cancelled: [] },

  // Tricia — Yin & Meditation (classIdx 1)
  { classIdx: 1, daysAgo: 4, students: [
    'nina.patel@gmail.com', 'brett.calloway@yahoo.com', 'rachel.ford@hotmail.com',
    'yuki.tanaka@gmail.com', 'diane.holloway@gmail.com', 'fiona.walsh@hotmail.com',
    'cleo.baptiste@gmail.com', 'ravi.mehta@gmail.com', 'tanya.obi@gmail.com',
    'sofia.reyes@gmail.com', 'omar.sharif@outlook.com', 'elliot.barnes@yahoo.com',
    'patrick.nguyen@gmail.com', 'leila.hassan@outlook.com',
  ], cancelled: ['yuki.tanaka@gmail.com'] },

  { classIdx: 1, daysAgo: 11, students: [
    'sarah.mitchell@gmail.com', 'james.okoye@outlook.com', 'marcus.webb@yahoo.com',
    'nina.patel@gmail.com', 'brett.calloway@yahoo.com', 'rachel.ford@hotmail.com',
    'sofia.reyes@gmail.com',
  ], cancelled: [] },

  // Tricia — Morning Flow (classIdx 2)
  { classIdx: 2, daysAgo: 6, students: [
    'diane.holloway@gmail.com', 'tom.reyes@gmail.com', 'kevin.marsh@gmail.com',
    'chris.donovan@gmail.com', 'leila.hassan@outlook.com', 'fiona.walsh@hotmail.com',
    'ravi.mehta@gmail.com', 'cleo.baptiste@gmail.com', 'tanya.obi@gmail.com',
    'patrick.nguyen@gmail.com', 'jake.moreno@gmail.com',
  ], cancelled: ['kevin.marsh@gmail.com'] },

  // Maya — Vinyasa Flow (classIdx 3)
  { classIdx: 3, daysAgo: 3, students: [
    'sarah.mitchell@gmail.com', 'marcus.webb@yahoo.com', 'nina.patel@gmail.com',
    'brett.calloway@yahoo.com', 'rachel.ford@hotmail.com', 'sofia.reyes@gmail.com',
    'ravi.mehta@gmail.com', 'elliot.barnes@yahoo.com', 'omar.sharif@outlook.com',
    'tanya.obi@gmail.com', 'fiona.walsh@hotmail.com', 'james.okoye@outlook.com',
    'chris.donovan@gmail.com', 'cleo.baptiste@gmail.com', 'patrick.nguyen@gmail.com',
    'leila.hassan@outlook.com', 'yuki.tanaka@gmail.com',
  ], cancelled: ['priya.nair@gmail.com', 'james.okoye@outlook.com'] },

  { classIdx: 3, daysAgo: 10, students: [
    'rachel.ford@hotmail.com', 'tom.reyes@gmail.com', 'nina.patel@gmail.com',
    'brett.calloway@yahoo.com', 'marcus.webb@yahoo.com', 'sarah.mitchell@gmail.com',
    'sofia.reyes@gmail.com', 'ravi.mehta@gmail.com',
  ], cancelled: [] },

  // Maya — Power Pilates (classIdx 4)
  { classIdx: 4, daysAgo: 5, students: [
    'brett.calloway@yahoo.com', 'diane.holloway@gmail.com', 'james.okoye@outlook.com',
    'rachel.ford@hotmail.com', 'tom.reyes@gmail.com', 'fiona.walsh@hotmail.com',
    'cleo.baptiste@gmail.com', 'ravi.mehta@gmail.com', 'tanya.obi@gmail.com',
    'sofia.reyes@gmail.com', 'patrick.nguyen@gmail.com', 'chris.donovan@gmail.com',
    'kevin.marsh@gmail.com', 'nina.patel@gmail.com', 'leila.hassan@outlook.com',
    'omar.sharif@outlook.com', 'elliot.barnes@yahoo.com', 'yuki.tanaka@gmail.com',
    'sarah.mitchell@gmail.com', 'marcus.webb@yahoo.com',
  ], cancelled: ['diane.holloway@gmail.com', 'kevin.marsh@gmail.com'] },

  { classIdx: 4, daysAgo: 12, students: [
    'rachel.ford@hotmail.com', 'tom.reyes@gmail.com', 'brett.calloway@yahoo.com',
    'james.okoye@outlook.com', 'fiona.walsh@hotmail.com', 'cleo.baptiste@gmail.com',
  ], cancelled: [] },

  // Jordan — Pilates Fundamentals (classIdx 5)
  { classIdx: 5, daysAgo: 1, students: [
    'laura.chen@icloud.com', 'amara.osei@gmail.com', 'chris.donovan@gmail.com',
    'nina.patel@gmail.com', 'patrick.nguyen@gmail.com', 'dana.cross@icloud.com',
    'tanya.obi@gmail.com', 'ravi.mehta@gmail.com', 'jake.moreno@gmail.com',
  ], cancelled: ['laura.chen@icloud.com'] },

  { classIdx: 5, daysAgo: 8, students: [
    'nina.patel@gmail.com', 'chris.donovan@gmail.com', 'leila.hassan@outlook.com',
    'tanya.obi@gmail.com', 'ravi.mehta@gmail.com', 'sofia.reyes@gmail.com',
    'patrick.nguyen@gmail.com', 'fiona.walsh@hotmail.com', 'cleo.baptiste@gmail.com',
    'brett.calloway@yahoo.com', 'james.okoye@outlook.com',
  ], cancelled: [] },

  // Jordan — Weekend Yoga Online (classIdx 6)
  { classIdx: 6, daysAgo: 7, students: [
    'yuki.tanaka@gmail.com', 'leila.hassan@outlook.com', 'kevin.marsh@gmail.com',
    'omar.sharif@outlook.com', 'elliot.barnes@yahoo.com', 'marcus.webb@yahoo.com',
    'dana.cross@icloud.com', 'amara.osei@gmail.com', 'jake.moreno@gmail.com',
  ], cancelled: ['yuki.tanaka@gmail.com'] },

  { classIdx: 6, daysAgo: 14, students: [
    'omar.sharif@outlook.com', 'elliot.barnes@yahoo.com', 'yuki.tanaka@gmail.com',
    'leila.hassan@outlook.com', 'kevin.marsh@gmail.com', 'marcus.webb@yahoo.com',
    'amara.osei@gmail.com',
  ], cancelled: [] },

  // Sam — Sunday Meditation Online (classIdx 7)
  { classIdx: 7, daysAgo: 7, students: [
    'marcus.webb@yahoo.com', 'diane.holloway@gmail.com', 'brett.calloway@yahoo.com',
    'sarah.mitchell@gmail.com', 'rachel.ford@hotmail.com', 'elliot.barnes@yahoo.com',
    'omar.sharif@outlook.com', 'yuki.tanaka@gmail.com', 'cleo.baptiste@gmail.com',
    'tanya.obi@gmail.com', 'fiona.walsh@hotmail.com',
  ], cancelled: ['brett.calloway@yahoo.com'] },

  { classIdx: 7, daysAgo: 14, students: [
    'sarah.mitchell@gmail.com', 'rachel.ford@hotmail.com', 'marcus.webb@yahoo.com',
    'diane.holloway@gmail.com', 'brett.calloway@yahoo.com', 'elliot.barnes@yahoo.com',
    'omar.sharif@outlook.com', 'nina.patel@gmail.com',
  ], cancelled: [] },
];

function daysAgoDate(n) {
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

  // Insert students
  await Student.insertMany(STUDENTS.map((s, i) => ({
    ...s,
    firstVisit: new Date(now.getTime() - (35 - i) * 24 * 60 * 60 * 1000),
    waiverSignedAt: s.waiverSigned ? new Date(now.getTime() - (33 - i) * 24 * 60 * 60 * 1000) : null,
  })));
  console.log(`✓ Inserted ${STUDENTS.length} students`);

  // Insert passes
  await Pass.insertMany(Object.entries(STUDENT_PASS).map(([email, p]) => ({
    code:         p.code,
    type:         p.type,
    studentEmail: email,
    classesTotal: p.total,
    classesUsed:  p.used,
    expiresAt:    p.daysExp ? new Date(now.getTime() + p.daysExp * 24*60*60*1000) : null,
    active:       true,
  })));
  console.log(`✓ Inserted ${Object.keys(STUDENT_PASS).length} passes`);

  // Build bookings from sessions
  const bookings = [];
  const seen = new Set();

  for (const session of SESSIONS) {
    const cls   = CLASSES[session.classIdx];
    const date  = daysAgoDate(session.daysAgo);
    const cancelSet = new Set(session.cancelled);

    for (const email of session.students) {
      const key = `${email}|${cls.id}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pass = STUDENT_PASS[email];
      const status = cancelSet.has(email) ? 'cancelled' : 'confirmed';
      const checkedIn = status === 'confirmed' && Math.random() > 0.15;

      bookings.push({
        studentEmail: email,
        studentName:  STUDENTS.find(s => s.email === email)?.name ?? email,
        classId:      cls.id,
        date,
        paymentType:  pass?.type ?? 'dropin',
        status,
        checkedIn,
        checkedInAt:  checkedIn ? new Date() : null,
      });
    }
  }

  await Booking.insertMany(bookings, { ordered: false }).catch(e => {
    console.log(`⚠ Some bookings skipped: ${e.message.slice(0, 100)}`);
  });
  console.log(`✓ Inserted ${bookings.length} bookings across ${SESSIONS.length} sessions`);

  console.log('\n✅ Seed complete');
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
