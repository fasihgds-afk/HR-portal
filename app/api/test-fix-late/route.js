// Fix late flags — visit http://localhost:3000/api/test-fix-late
// DELETE THIS FILE AFTER USE

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import ShiftAttendance from '@/models/ShiftAttendance';
import Shift from '@/models/Shift';

export async function GET() {
  await connectDB();

  const shifts = await Shift.find({}).lean();
  const shiftMap = new Map(shifts.map(s => [s.code, s]));

  // Find ALL records marked late
  const lateRecords = await ShiftAttendance.find({ late: true });

  const results = [];

  for (const att of lateRecords) {
    const shift = shiftMap.get(att.shift);
    if (!shift || !att.checkIn) {
      results.push({ empCode: att.empCode, date: att.date, status: 'skipped - no shift or checkIn' });
      continue;
    }

    const gracePeriod = shift.gracePeriod || 20;

    // Build shift start in UTC (Karachi = UTC+5)
    const [y, m, d] = att.date.split('-').map(Number);
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const shiftStartUTC = new Date(Date.UTC(y, m - 1, d, sh - 5, sm, 0));

    const graceEndUTC = new Date(shiftStartUTC.getTime() + gracePeriod * 60 * 1000);
    const checkInTime = new Date(att.checkIn);

    const wasLate = checkInTime > graceEndUTC;

    results.push({
      empCode: att.empCode,
      date: att.date,
      shift: att.shift,
      checkIn: att.checkIn,
      shiftStartUTC: shiftStartUTC.toISOString(),
      graceEndUTC: graceEndUTC.toISOString(),
      checkInUTC: checkInTime.toISOString(),
      gracePeriod,
      shouldBeLate: wasLate,
      currentLate: att.late,
      action: wasLate ? 'kept late' : 'FIXED → not late',
    });

    if (!wasLate) {
      att.late = false;
      await att.save();
    }
  }

  return NextResponse.json({
    totalLateRecords: lateRecords.length,
    fixed: results.filter(r => r.action?.includes('FIXED')).length,
    results,
  });
}
