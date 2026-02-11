// app/api/attendance/my-breaks/route.js
// Employee self-service: View my own break/idle logs.
// GET ?empCode=00002             → today's breaks
// GET ?empCode=00002&date=2026-02-10 → specific date

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import BreakLog from '@/models/BreakLog';

const TZ = 'Asia/Karachi';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empCode = searchParams.get('empCode');
    const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: TZ });

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode query parameter is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const logs = await BreakLog.find({
      empCode: empCode.trim(),
      date,
    })
      .sort({ startedAt: -1 })
      .lean();

    const totalBreaks = logs.length;
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationMin || 0), 0);

    return NextResponse.json({
      empCode: empCode.trim(),
      date,
      totalBreaks,
      totalDurationMin: totalDuration,
      breaks: logs.map(l => ({
        reason: l.reason,
        customReason: l.customReason,
        startedAt: l.startedAt,
        endedAt: l.endedAt,
        durationMin: l.durationMin,
        isOpen: !l.endedAt,
      })),
    });
  } catch (err) {
    console.error('My breaks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
