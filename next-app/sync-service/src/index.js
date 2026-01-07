// src/index.js
require('dotenv').config();

const mongoose = require('mongoose');
const DigestFetch = require('digest-fetch');
const cron = require('node-cron');
const AttendanceEvent = require('./models/AttendanceEvent');

// ------------------ ENV ------------------
const {
  MONGO_URI,
  HIK_DEVICE_IP,
  HIK_USER,
  HIK_PASS,
  TIMEZONE_OFFSET // e.g. "+05:00"
} = process.env;

if (!MONGO_URI || !HIK_DEVICE_IP || !HIK_USER || !HIK_PASS || !TIMEZONE_OFFSET) {
  console.error(
    '❌ Please set MONGO_URI, HIK_DEVICE_IP, HIK_USER, HIK_PASS, TIMEZONE_OFFSET in .env'
  );
  process.exit(1);
}

const client = new DigestFetch(HIK_USER, HIK_PASS);

// ------------------ HELPERS ------------------

// Format JS Date as "YYYY-MM-DDTHH:mm:ss+05:00"
// We use local date parts and just append TIMEZONE_OFFSET.
function formatHikTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${TIMEZONE_OFFSET}`;
}

async function connectDb() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Mongo connected (sync-service)');
}

// Low-level call to Hikvision for a date range and page (position)
async function fetchRange(startDate, endDate, position = 0, maxResults = 50) {
  const url = `http://${HIK_DEVICE_IP}/ISAPI/AccessControl/AcsEvent?format=json`;

  const body = {
    AcsEventCond: {
      searchID: 'Sync1',
      searchResultPosition: position,
      maxResults,
      major: 5, // Access events
      minor: 0, // 0 = all minors (we filter in reporting later)
      startTime: formatHikTime(startDate),
      endTime: formatHikTime(endDate)
    }
  };

  const res = await client.fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Hikvision HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const acs = data.AcsEvent || {};
  const list = acs.InfoList || acs.AcsEventInfo || [];
  const num = acs.numOfMatches ?? list.length;
  const total = acs.totalMatches ?? num;

  for (const ev of list) {
    const ts = ev.time;
    if (!ts) continue;

    // Example: "2025-11-20T18:30:25+05:00"
    const eventTime = new Date(ts);

    const doc = {
      deviceIp: HIK_DEVICE_IP,
      eventTime,
      empCode: ev.employeeNoString || null,
      cardNo: ev.cardNo || null,
      doorNo: ev.doorNo ?? null,
      serialNo: ev.serialNo ?? null,
      verifyMode: ev.currentVerifyMode || null,
      attendanceStatus: ev.attendanceStatus || null,
      major: ev.major ?? null,
      minor: ev.minor ?? null,
      raw: ev
    };

    // Upsert = no duplicates even if we sync overlapping ranges
    await AttendanceEvent.updateOne(
      {
        deviceIp: HIK_DEVICE_IP,
        eventTime,
        serialNo: doc.serialNo
      },
      { $set: doc },
      { upsert: true }
    );
  }

  return { num, total };
}

// ------------------ BUSINESS RANGES ------------------

// Business day: 09:00 (same day) -> 07:00 (next day)
//  - D1: 09:00–18:00
//  - D2: 15:00–24:00
//  - S1 / S2: evenings to early morning next day
function getBusinessRange(dateStr) {
  // dateStr: "YYYY-MM-DD"
  const start = new Date(`${dateStr}T09:00:00${TIMEZONE_OFFSET}`);

  const end = new Date(start);
  end.setDate(end.getDate() + 1); // next day
  end.setHours(8, 0, 0, 0); // 08:00 next day

  return { start, end };
}

// Get yesterday in "YYYY-MM-DD"
function getYYYYMMDD(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getYYYYMMDD(d);
}

// Determine the "current business date":
// - If now >= 09:00 local -> use today
// - If now < 09:00 -> still working on yesterday's business day
function getCurrentBusinessDateStr() {
  const now = new Date();
  const todayStr = getYYYYMMDD(now);
  if (now.getHours() >= 9) {
    return todayStr;
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return getYYYYMMDD(y);
}

// ------------------ SYNC FUNCTIONS ------------------

// Full business day (manual or daily cron)
async function syncBusinessDay(dateStr) {
  const { start, end } = getBusinessRange(dateStr);

  console.log(
    `⏱ Syncing FULL business day ${dateStr} from`,
    start.toISOString(),
    'to',
    end.toISOString()
  );

  let pos = 0;
  const size = 50;

  while (true) {
    const { num, total } = await fetchRange(start, end, pos, size);
    console.log(`📥 [${dateStr}] Fetched ${num} / ${total} (pos=${pos})`);

    if (num === 0 || pos + num >= total) break;
    pos += num;
  }

  console.log(`✅ Full-day sync finished for ${dateStr}`);
}

// Sync from business-day 09:00 -> *now* (for automatic startup)
async function syncCurrentBusinessSoFar() {
  const bizDate = getCurrentBusinessDateStr();
  const { start } = getBusinessRange(bizDate);
  const end = new Date(); // now

  console.log(
    `⏱ Initial sync for current business date ${bizDate} from`,
    start.toISOString(),
    'to',
    end.toISOString()
  );

  let pos = 0;
  const size = 50;

  while (true) {
    const { num, total } = await fetchRange(start, end, pos, size);
    console.log(`📥 [init ${bizDate}] Fetched ${num} / ${total} (pos=${pos})`);

    if (num === 0 || pos + num >= total) break;
    pos += num;
  }

  console.log(`✅ Initial business sync finished for ${bizDate}`);
}

// Real-time window sync (e.g. last 5 mins) for cron
async function syncWindow(minutesBack = 5) {
  const end = new Date();
  const start = new Date(end.getTime() - minutesBack * 60 * 1000);

  console.log(
    `⏱ Syncing events from ${start.toISOString()} to ${end.toISOString()} (window=${minutesBack}m)`
  );

  let pos = 0;
  const size = 50;

  while (true) {
    const { num, total } = await fetchRange(start, end, pos, size);
    console.log(`📥 [window] Fetched ${num} / ${total} (pos=${pos})`);

    if (num === 0 || pos + num >= total) break;
    pos += num;
  }

  console.log('✅ Window sync finished');
}

// ------------------ MAIN ------------------

async function main() {
  try {
    await connectDb();

    const argDate = process.argv[2]; // optional: YYYY-MM-DD

    // If you run: node src/index.js 2025-11-20
    // → fetch FULL business day 2025-11-20 and exit.
    if (argDate) {
      await syncBusinessDay(argDate);
      process.exit(0);
    }

    // SERVICE MODE: npm start  → node src/index.js

    // 1) On startup: sync whole current business day (09:00 -> now)
    await syncCurrentBusinessSoFar();

    // 2) Real-time every 2 minutes (pull last 5 minutes)
    cron.schedule('*/2 * * * *', () => {
      syncWindow(5).catch((err) => {
        console.error('Sync window error:', err.message || err);
      });
    });

    // 3) Every day at 07:10, sync FULL previous business day
    //    This guarantees 09:00 (yesterday) -> 07:00 (today).
    cron.schedule('10 7 * * *', () => {
      const yest = getYesterdayStr();
      console.log(`🔁 Daily full business-day sync for ${yest}`);
      syncBusinessDay(yest).catch((err) => {
        console.error('Daily full-day sync error:', err.message || err);
      });
    });

    console.log('🚀 Sync service running (startup full sync + real-time + daily full sync)…');
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

main();

// Optional export if you want to trigger from Next.js API later
module.exports = {
  syncBusinessDay,
  syncWindow
};
