// app/api/fix-breaks/route.js
// ONE-TIME cleanup: Delete bad break records created before the UTC timezone fix.
// Bad breaks have startedAt shifted +5 hours, causing negative or 300+ minute durations.
// Run once via GET /api/fix-breaks, then delete this file.

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import BreakLog from '@/models/BreakLog';

export async function GET() {
  try {
    await connectDB();

    // Find breaks with suspicious durations (negative, or very long: > 240 min = 4 hrs)
    // Also find any breaks still open (endedAt = null) from old test data
    const badBreaks = await BreakLog.find({
      $or: [
        { durationMin: { $lt: 0 } },           // Negative durations (timezone bug)
        { durationMin: { $gte: 240 } },         // Unrealistically long (4+ hrs) 
        { endedAt: null },                      // Orphaned open breaks
      ],
    }).lean();

    const summary = {
      totalBadBreaks: badBreaks.length,
      negative: badBreaks.filter(b => (b.durationMin || 0) < 0).length,
      tooLong: badBreaks.filter(b => (b.durationMin || 0) >= 240).length,
      orphaned: badBreaks.filter(b => !b.endedAt).length,
      byEmployee: {},
    };

    // Group by employee for review
    for (const b of badBreaks) {
      if (!summary.byEmployee[b.empCode]) {
        summary.byEmployee[b.empCode] = [];
      }
      summary.byEmployee[b.empCode].push({
        id: b._id,
        reason: b.reason,
        customReason: b.customReason,
        startedAt: b.startedAt,
        endedAt: b.endedAt,
        durationMin: b.durationMin,
        date: b.date,
      });
    }

    // Delete all bad breaks
    const deleteResult = await BreakLog.deleteMany({
      $or: [
        { durationMin: { $lt: 0 } },
        { durationMin: { $gte: 240 } },
        { endedAt: null },
      ],
    });

    return NextResponse.json({
      ok: true,
      message: `Cleaned up ${deleteResult.deletedCount} bad break records`,
      summary,
    });
  } catch (err) {
    console.error('Fix breaks error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
