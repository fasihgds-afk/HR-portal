// app/api/attendance/me/route.js
// Employee self-service: returns today's ShiftAttendance record.
// Uses Asia/Karachi timezone to determine "today".

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import ShiftAttendance from '@/models/ShiftAttendance';

const TZ = 'Asia/Karachi';

/**
 * Subtract days from a YYYY-MM-DD string safely.
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids edge issues
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode query parameter is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Today in Asia/Karachi (YYYY-MM-DD) — reliable cross-platform
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const yesterdayStr = addDays(today, -1);

    // Find today's record first, fallback to yesterday's (for night shifts after midnight)
    let attendance = await ShiftAttendance.findOne({
      empCode: empCode.trim(),
      date: today,
    }).lean();

    // If no record today, check yesterday (night shift that started yesterday)
    if (!attendance) {
      attendance = await ShiftAttendance.findOne({
        empCode: empCode.trim(),
        date: yesterdayStr,
        checkOut: null, // still open = night shift in progress
      }).lean();
    }

    if (!attendance) {
      return NextResponse.json({
        empCode: empCode.trim(),
        date: today,
        attendance: null,
        message: 'No attendance record found for today',
      });
    }

    return NextResponse.json({
      empCode: attendance.empCode,
      date: attendance.date,
      attendance: {
        shift: attendance.shift,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        attendanceStatus: attendance.attendanceStatus,
        late: attendance.late,
        earlyLeave: attendance.earlyLeave,
        totalPunches: attendance.totalPunches,
        lateExcused: attendance.lateExcused,
        earlyExcused: attendance.earlyExcused,
      },
    });
  } catch (err) {
    console.error('My attendance error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
