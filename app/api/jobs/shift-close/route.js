// app/api/jobs/shift-close/route.js
// Cron/scheduler endpoint: auto check-out employees whose shift has ended.
// Protected by X-JOB-SECRET header.
// Call this from a cron job (e.g. every 30 min) or manually for a specific date+shift.

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Shift from '@/models/Shift';
import Device from '@/models/Device';
import ShiftAttendance from '@/models/ShiftAttendance';

const TZ = 'Asia/Karachi';

/**
 * Build a Date for a wall-clock time in Asia/Karachi.
 * PKT = UTC+5 (no DST).
 */
function buildKarachiDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 5, min, 0, 0));
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(request) {
  try {
    // ── Auth: require X-JOB-SECRET header ──────────────────
    const secret = request.headers.get('x-job-secret');
    const expectedSecret = process.env.JOB_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid or missing X-JOB-SECRET' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { date, shift: shiftCode } = body;

    if (!date || !shiftCode) {
      return NextResponse.json(
        { error: 'date (YYYY-MM-DD) and shift (code) are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // ── Resolve the Shift model ─────────────────────────────
    const shift = await Shift.findOne({ code: shiftCode.toUpperCase().trim() }).lean();
    if (!shift) {
      return NextResponse.json(
        { error: `Shift not found: ${shiftCode}` },
        { status: 404 }
      );
    }

    // ── Compute shiftEnd in wall-clock ──────────────────────
    let shiftEnd;
    if (shift.crossesMidnight) {
      // Shift ends the day AFTER the attendance date
      shiftEnd = buildKarachiDate(addDays(date, 1), shift.endTime);
    } else {
      shiftEnd = buildKarachiDate(date, shift.endTime);
    }

    // Early leave threshold: 20 minutes before shift end
    const earlyLeaveThreshold = new Date(shiftEnd.getTime() - 20 * 60 * 1000);

    // ── Find open records (checked in but not checked out) ──
    const openRecords = await ShiftAttendance.find({
      date,
      shift: shift.code,
      checkIn: { $ne: null },
      checkOut: null,
    });

    if (openRecords.length === 0) {
      return NextResponse.json({
        message: 'No open attendance records found',
        date,
        shift: shift.code,
        closedCount: 0,
      });
    }

    // ── Batch-load device last-seen times ───────────────────
    const empCodes = openRecords.map((r) => r.empCode);
    const devices = await Device.find({
      empCode: { $in: empCodes },
      isRevoked: false,
    })
      .select('empCode lastSeenAt')
      .lean();

    // Map: empCode → latest lastSeenAt across devices
    const deviceLastSeen = new Map();
    for (const d of devices) {
      const existing = deviceLastSeen.get(d.empCode);
      if (!existing || (d.lastSeenAt && d.lastSeenAt > existing)) {
        deviceLastSeen.set(d.empCode, d.lastSeenAt);
      }
    }

    // ── Close each open record ──────────────────────────────
    let closedCount = 0;
    let earlyLeaveCount = 0;

    for (const record of openRecords) {
      record.checkOut = shiftEnd;
      record.totalPunches = (record.totalPunches || 0) + 1;

      // Check early leave: device last seen before shiftEnd - 20 min
      const lastSeen = deviceLastSeen.get(record.empCode);
      if (lastSeen && lastSeen < earlyLeaveThreshold) {
        record.earlyLeave = true;
        earlyLeaveCount++;
      }

      await record.save();
      closedCount++;
    }

    return NextResponse.json({
      message: `Closed ${closedCount} attendance records`,
      date,
      shift: shift.code,
      shiftEnd: shiftEnd.toISOString(),
      closedCount,
      earlyLeaveCount,
    });
  } catch (err) {
    console.error('Shift close error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
