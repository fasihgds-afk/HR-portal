// next-app/app/api/employee/attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import AttendanceEvent from '../../../../models/AttendanceEvent';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/employee/attendance?empCode=EMP001&month=2025-11
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const month = searchParams.get('month'); // "YYYY-MM"

    if (!empCode || !month) {
      return NextResponse.json(
        { error: 'empCode and month=YYYY-MM are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Month range
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1; // 0-based

    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

    // OPTIMIZATION: Select only required fields, use index hint, add timeout
    // Index: { empCode: 1, eventTime: 1 } should exist for fast queries
    const events = await AttendanceEvent.find({
      empCode,
      eventTime: { $gte: start, $lt: end },
      minor: 38,
    })
      .select('eventTime empCode') // Only select required fields
      .sort({ eventTime: 1 })
      .lean()
      .maxTimeMS(3000); // Fast timeout

    const byDay = new Map();

    for (const ev of events) {
      const local = new Date(ev.eventTime);
      const dayKey = local.toISOString().slice(0, 10); // "YYYY-MM-DD"

      let rec = byDay.get(dayKey);
      if (!rec) {
        rec = { date: dayKey, first: local, last: local, count: 1 };
        byDay.set(dayKey, rec);
      } else {
        if (local < rec.first) rec.first = local;
        if (local > rec.last) rec.last = local;
        rec.count += 1;
      }
    }

    const items = Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        firstIn: r.first,
        lastOut: r.last,
        totalPunches: r.count,
      }));

    return NextResponse.json({ empCode, month, items });
  } catch (err) {
    console.error('Employee attendance API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
