// Temporary route to fix grace period on existing shifts
// Visit: http://localhost:3000/api/test-fix-grace
// DELETE THIS FILE AFTER RUNNING

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Shift from '@/models/Shift';

export async function GET() {
  await connectDB();

  // Show current grace periods
  const before = await Shift.find({}).select('code name gracePeriod').lean();

  // Update all shifts to gracePeriod: 20
  const result = await Shift.updateMany(
    {},
    { $set: { gracePeriod: 20 } }
  );

  const after = await Shift.find({}).select('code name gracePeriod').lean();

  return NextResponse.json({
    message: 'All shifts updated to 20-minute grace period',
    updated: result.modifiedCount,
    before,
    after,
  });
}
