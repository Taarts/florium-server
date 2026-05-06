require("dotenv").config();
const mongoose = require("mongoose");
const Class = require("./models/Class");
const Workshop = require("./models/Workshop");

const CLASSES = [
  {
    id: "cls_mon",
    title: "Morning Flow Yoga",
    teacher: "Maya Patel",
    dayOfWeek: 1,
    time: "09:00",
    duration: 75,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_tue_pm",
    title: "Pilates Fundamentals",
    teacher: "Jordan Lee",
    dayOfWeek: 2,
    time: "18:00",
    duration: 60,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_wed",
    title: "Hatha Yoga",
    teacher: "Maya Patel",
    dayOfWeek: 3,
    time: "10:00",
    duration: 90,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_wed_eve",
    title: "Yin & Meditation",
    teacher: "Sam Rivera",
    dayOfWeek: 3,
    time: "19:00",
    duration: 75,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_thu",
    title: "Power Pilates",
    teacher: "Jordan Lee",
    dayOfWeek: 4,
    time: "07:00",
    duration: 60,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_fri",
    title: "Vinyasa Flow",
    teacher: "Maya Patel",
    dayOfWeek: 5,
    time: "10:00",
    duration: 90,
    venue: "venue_001",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_sat_online",
    title: "Weekend Yoga — Online",
    teacher: "Sam Rivera",
    dayOfWeek: 6,
    time: "08:30",
    duration: 90,
    venue: "venue_online",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
  {
    id: "cls_sun_online",
    title: "Sunday Meditation — Online",
    teacher: "Sam Rivera",
    dayOfWeek: 0,
    time: "09:00",
    duration: 60,
    venue: "venue_online",
    price: 25,
    isPrivate: false,
    startDate: "2026-01-01",
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✓ Connected");

  await Class.deleteMany({});
  await Class.insertMany(CLASSES);
  console.log(`✓ Seeded ${CLASSES.length} classes`);

  await Workshop.deleteMany({});
  console.log("✓ Workshops cleared (add via admin)");

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch(err => { console.error(err); process.exit(1); });