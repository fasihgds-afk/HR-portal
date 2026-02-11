// app/api/monitor/break-logs/route.js
// HR Admin: View all employee break/idle logs.
// GET ?date=2026-02-10          → all breaks for that date
// GET ?date=2026-02-10&empCode=00002 → specific employee
// GET (no params)               → today's breaks

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import BreakLog from '@/models/BreakLog';

const TZ = 'Asia/Karachi';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const empCode = searchParams.get('empCode');
    const department = searchParams.get('department');

    await connectDB();

    const filter = { date };
    if (empCode) filter.empCode = empCode.trim();
    if (department) filter.department = department;

    const logs = await BreakLog.find(filter)
      .sort({ startedAt: -1 })
      .lean();

    // Summary stats
    const totalBreaks = logs.length;
    const openBreaks = logs.filter(l => !l.endedAt).length;
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationMin || 0), 0);

    // Reason breakdown
    const byReason = {};
    for (const log of logs) {
      const key = log.reason || 'Unknown';
      if (!byReason[key]) byReason[key] = { count: 0, totalMin: 0 };
      byReason[key].count++;
      byReason[key].totalMin += log.durationMin || 0;
    }

    return NextResponse.json({
      date,
      totalBreaks,
      openBreaks,
      totalDurationMin: totalDuration,
      byReason,
      logs: logs.map(l => ({
        empCode: l.empCode,
        employeeName: l.employeeName,
        department: l.department,
        shift: l.shift,
        reason: l.reason,
        customReason: l.customReason,
        startedAt: l.startedAt,
        endedAt: l.endedAt,
        durationMin: l.durationMin,
        isOpen: !l.endedAt,
      })),
    });
  } catch (err) {
    console.error('Break logs monitor error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
