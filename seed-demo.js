const mongoose = require('/var/www/florium-server/node_modules/mongoose');

const MONGO_URI = process.env.MONGODB_URI;

const CLASS_IDS = {
  hatha:     '69fa8e6fc7af4ba169d04f8e',
  yin:       '69fa8e6fc7af4ba169d04f8f',
  weekend:   '69fa8e6fc7af4ba169d04f92',
  sunday:    '69fa8e6fc7af4ba169d04f93',
  pilates:   '69fa8e6fc7af4ba169d04f90',
  pilatesFund: '69fa8e6fc7af4ba169d04f8d',
  morning:   '69fa8e6fc7af4ba169d04f8c',
  vinyasa:   '69fa8e6fc7af4ba169d04f91',
};

const CLASS_TITLES = {
  [CLASS_IDS.hatha]:      'Hatha Yoga',
  [CLASS_IDS.yin]:        'Yin & Meditation',
  [CLASS_IDS.weekend]:    'Weekend Yoga — Online',
  [CLASS_IDS.sunday]:     'Sunday Meditation — Online',
  [CLASS_IDS.pilates]:    'Power Pilates',
  [CLASS_IDS.pilatesFund]:'Pilates Fundamentals',
  [CLASS_IDS.morning]:    'Morning Flow Yoga',
  [CLASS_IDS.vinyasa]:    'Vinyasa Flow',
};

const STUDENTS = [
  { name: 'Sarah Mitchell',  email: 'sarah.mitchell@gmail.com',   phone: '727-555-0101', city: 'St. Petersburg', state: 'FL', zip: '33701', isLocal: true,  waiverSigned: true },
  { name: 'James Okoye',     email: 'james.okoye@outlook.com',    phone: '727-555-0102', city: 'Tampa',          state: 'FL', zip: '33602', isLocal: true,  waiverSigned: true },
  { name: 'Priya Nair',      email: 'priya.nair@gmail.com',       phone: '813-555-0103', city: 'Clearwater',     state: 'FL', zip: '33755', isLocal: true,  waiverSigned: true },
  { name: 'Laura Chen',      email: 'laura.chen@icloud.com',      phone: '727-555-0104', city: 'St. Petersburg', state: 'FL', zip: '33704', isLocal: true,  waiverSigned: false },
  { name: 'Marcus Webb',     email: 'marcus.webb@yahoo.com',      phone: '212-555-0105', city: 'New York',       state: 'NY', zip: '10001', isLocal: false, waiverSigned: true },
  { name: 'Diane Holloway',  email: 'diane.holloway@gmail.com',   phone: '727-555-0106', city: 'St. Petersburg', state: 'FL', zip: '33705', isLocal: true,  waiverSigned: true },
  { name: 'Tom Reyes',       email: 'tom.reyes@gmail.com',        phone: '727-555-0107', city: 'Pinellas Park',  state: 'FL', zip: '33781', isLocal: true,  waiverSigned: true },
  { name: 'Amara Osei',      email: 'amara.osei@gmail.com',       phone: '404-555-0108', city: 'Atlanta',        state: 'GA', zip: '30301', isLocal: false, waiverSigned: true },
  { name: 'Rachel Ford',     email: 'rachel.ford@hotmail.com',    phone: '727-555-0109', city: 'St. Petersburg', state: 'FL', zip: '33710', isLocal: true,  waiverSigned: true },
  { name: 'Kevin Marsh',     email: 'kevin.marsh@gmail.com',      phone: '727-555-0110', city: 'Largo',          state: 'FL', zip: '33770', isLocal: true,  waiverSigned: false },
];

// Generate dates relative to today
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const Student = require('/var/www/florium-server/models/Student');
  const Pass    = require('/var/www/florium-server/models/Pass');
  const Booking = require('/var/www/florium-server/models/Booking');
  const Sale    = require('/var/www/florium-server/models/Sale');

  // ── Clear existing demo data ──────────────────────────────
  const emails = STUDENTS.map(s => s.email);
  await Student.deleteMany({ email: { $in: emails } });
  await Pass.deleteMany({ studentEmail: { $in: emails } });
  await Booking.deleteMany({ studentEmail: { $in: emails } });
  console.log('✓ Cleared existing demo data');

  // ── Insert students ───────────────────────────────────────
  const now = new Date();
  const studentDocs = await Student.insertMany(STUDENTS.map((s, i) => ({
    ...s,
    firstVisit: new Date(now.getTime() - (30 - i * 2) * 24 * 60 * 60 * 1000),
    waiverSignedAt: s.waiverSigned ? new Date(now.getTime() - (28 - i) * 24 * 60 * 60 * 1000) : null,
  })));
  console.log(`✓ Inserted ${studentDocs.length} students`);

  // ── Insert passes ─────────────────────────────────────────
  const passConfigs = [
    { email: 'sarah.mitchell@gmail.com', type: 'pass8',     code: 'YOGA-DEMO01', total: 8,    used: 3, expiresAt: new Date(now.getTime() + 60 * 24*60*60*1000) },
    { email: 'james.okoye@outlook.com',  type: 'member2x',  code: 'YOGA-DEMO02', total: null, used: 6, expiresAt: null },
    { email: 'priya.nair@gmail.com',     type: 'pass4',     code: 'YOGA-DEMO03', total: 4,    used: 4, expiresAt: new Date(now.getTime() + 5  * 24*60*60*1000) },
    { email: 'laura.chen@icloud.com',    type: 'dropin',    code: 'YOGA-DEMO04', total: 1,    used: 0, expiresAt: null },
    { email: 'marcus.webb@yahoo.com',    type: 'pass8',     code: 'YOGA-DEMO05', total: 8,    used: 7, expiresAt: new Date(now.getTime() + 10 * 24*60*60*1000) },
    { email: 'diane.holloway@gmail.com', type: 'memberUnl', code: 'YOGA-DEMO06', total: null, used: 12, expiresAt: null },
    { email: 'tom.reyes@gmail.com',      type: 'pass4',     code: 'YOGA-DEMO07', total: 4,    used: 2, expiresAt: new Date(now.getTime() + 30 * 24*60*60*1000) },
    { email: 'amara.osei@gmail.com',     type: 'dropin',    code: 'YOGA-DEMO08', total: 1,    used: 1, expiresAt: null },
    { email: 'rachel.ford@hotmail.com',  type: 'pass8',     code: 'YOGA-DEMO09', total: 8,    used: 1, expiresAt: new Date(now.getTime() + 90 * 24*60*60*1000) },
    { email: 'kevin.marsh@gmail.com',    type: 'pass4',     code: 'YOGA-DEMO10', total: 4,    used: 3, expiresAt: new Date(now.getTime() + 3  * 24*60*60*1000) },
  ];

  const passDocs = await Pass.insertMany(passConfigs.map(p => ({
    code: p.code,
    type: p.type,
    studentEmail: p.email,
    classesTotal: p.total,
    classesUsed:  p.used,
    expiresAt:    p.expiresAt,
    active:       true,
  })));
  console.log(`✓ Inserted ${passDocs.length} passes`);

  // ── Insert bookings ───────────────────────────────────────
  const classIds = Object.values(CLASS_IDS);
  const bookings = [];
  const seen = new Set();

  const bookingData = [
    // Sarah — pass8
    { email: 'sarah.mitchell@gmail.com', name: 'Sarah Mitchell',  type: 'pass8',    checkedIn: true  },
    { email: 'sarah.mitchell@gmail.com', name: 'Sarah Mitchell',  type: 'pass8',    checkedIn: true  },
    { email: 'sarah.mitchell@gmail.com', name: 'Sarah Mitchell',  type: 'pass8',    checkedIn: false },
    // James — member2x
    { email: 'james.okoye@outlook.com',  name: 'James Okoye',     type: 'member2x', checkedIn: true  },
    { email: 'james.okoye@outlook.com',  name: 'James Okoye',     type: 'member2x', checkedIn: true  },
    { email: 'james.okoye@outlook.com',  name: 'James Okoye',     type: 'member2x', checkedIn: true  },
    // Priya — pass4 (used up)
    { email: 'priya.nair@gmail.com',     name: 'Priya Nair',      type: 'pass4',    checkedIn: true  },
    { email: 'priya.nair@gmail.com',     name: 'Priya Nair',      type: 'pass4',    checkedIn: true  },
    // Laura — dropin
    { email: 'laura.chen@icloud.com',    name: 'Laura Chen',      type: 'dropin',   checkedIn: false },
    // Marcus — pass8 (nearly used)
    { email: 'marcus.webb@yahoo.com',    name: 'Marcus Webb',     type: 'pass8',    checkedIn: true  },
    { email: 'marcus.webb@yahoo.com',    name: 'Marcus Webb',     type: 'pass8',    checkedIn: true  },
    // Diane — memberUnl
    { email: 'diane.holloway@gmail.com', name: 'Diane Holloway',  type: 'memberUnl',checkedIn: true  },
    { email: 'diane.holloway@gmail.com', name: 'Diane Holloway',  type: 'memberUnl',checkedIn: true  },
    { email: 'diane.holloway@gmail.com', name: 'Diane Holloway',  type: 'memberUnl',checkedIn: false },
    // Tom — pass4
    { email: 'tom.reyes@gmail.com',      name: 'Tom Reyes',       type: 'pass4',    checkedIn: true  },
    { email: 'tom.reyes@gmail.com',      name: 'Tom Reyes',       type: 'pass4',    checkedIn: false },
    // Rachel — pass8
    { email: 'rachel.ford@hotmail.com',  name: 'Rachel Ford',     type: 'pass8',    checkedIn: true  },
    // Kevin — pass4 (nearly used)
    { email: 'kevin.marsh@gmail.com',    name: 'Kevin Marsh',     type: 'pass4',    checkedIn: true  },
    { email: 'kevin.marsh@gmail.com',    name: 'Kevin Marsh',     type: 'pass4',    checkedIn: true  },
  ];

  let dayOffset = 1;
  for (const b of bookingData) {
    // find a unique classId + date combo for this student
    let classId, date, key;
    let attempts = 0;
    do {
      classId = randomItem(classIds);
      date = daysAgo(dayOffset % 28 + 1);
      key = `${b.email}|${classId}|${date}`;
      dayOffset++;
      attempts++;
    } while (seen.has(key) && attempts < 50);
    seen.add(key);

    bookings.push({
      studentEmail: b.email,
      studentName:  b.name,
      classId,
      date,
      paymentType:  b.type,
      status:       'confirmed',
      checkedIn:    b.checkedIn,
      checkedInAt:  b.checkedIn ? new Date() : null,
    });
  }

  // Add a few cancelled bookings
  const cancelled = [
    { email: 'sarah.mitchell@gmail.com', name: 'Sarah Mitchell', type: 'pass8' },
    { email: 'james.okoye@outlook.com',  name: 'James Okoye',    type: 'member2x' },
    { email: 'priya.nair@gmail.com',     name: 'Priya Nair',     type: 'pass4' },
  ];
  for (const c of cancelled) {
    bookings.push({
      studentEmail: c.email,
      studentName:  c.name,
      classId:      randomItem(classIds),
      date:         daysAgo(randomInt(1, 14)),
      paymentType:  c.type,
      status:       'cancelled',
      checkedIn:    false,
    });
  }

  await Booking.insertMany(bookings, { ordered: false }).catch(e => {
    console.log(`⚠ Some bookings skipped (duplicate key): ${e.message.slice(0, 80)}`);
  });
  console.log(`✓ Inserted ${bookings.length} bookings`);

  // ── Insert merch sales ────────────────────────────────────
  const products = await mongoose.connection.db.collection('products').find({}).limit(5).toArray();
  if (products.length > 0) {
    const sales = [];
    for (let i = 0; i < 8; i++) {
      const product = randomItem(products);
      sales.push({
        productId:    product._id,
        productName:  product.name,
        price:        product.price,
        quantity:     randomInt(1, 3),
        studentEmail: randomItem(STUDENTS).email,
        date:         daysAgo(randomInt(1, 28)),
        stripePaymentId: `pi_demo_${i}`,
      });
    }
    await Sale.insertMany(sales, { ordered: false }).catch(() => {});
    console.log(`✓ Inserted ${sales.length} merch sales`);
  } else {
    console.log('⚠ No products found — skipping merch sales');
  }

  console.log('\n✅ Seed complete');
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
