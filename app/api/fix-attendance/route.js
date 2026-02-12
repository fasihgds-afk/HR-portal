// app/api/fix-attendance/route.js
// Comprehensive fix for ALL attendance records:
// 1. Ensures ALL shifts have gracePeriod = 20
// 2. Re-evaluates the "late" flag for EVERY attendance record (both late:true AND late:false)
// 3. Reports everything it found and fixed
//
// Run via GET /api/fix-attendance
// Add ?dryrun=true to preview changes without saving

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import ShiftAttendance from '@/models/ShiftAttendance';
import Shift from '@/models/Shift';

const GRACE_PERIOD_MIN = 20; // Standard grace period for all shifts

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryrun') === 'true';

    await connectDB();

    // Step 1: Fix all shift grace periods
    const shiftsBefore = await Shift.find({}).select('code name gracePeriod startTime endTime crossesMidnight').lean();

    const shiftUpdateResult = await Shift.updateMany(
      {},
      { $set: { gracePeriod: GRACE_PERIOD_MIN } }
    );

    const shiftsAfter = await Shift.find({}).select('code name gracePeriod startTime endTime crossesMidnight').lean();
    const shiftMap = new Map(shiftsAfter.map(s => [s.code, s]));

    // Step 2: Re-evaluate ALL attendance records that have a checkIn
    const allAttendance = await ShiftAttendance.find({ checkIn: { $ne: null } });

    const results = [];
    let fixedToLate = 0;
    let fixedToNotLate = 0;
    let alreadyCorrect = 0;
    let skipped = 0;

    for (const att of allAttendance) {
      const shift = shiftMap.get(att.shift);

      if (!shift) {
        results.push({
          empCode: att.empCode,
          date: att.date,
          shift: att.shift,
          status: 'SKIPPED - shift not found in DB',
        });
        skipped++;
        continue;
      }

      if (!att.checkIn) {
        results.push({
          empCode: att.empCode,
          date: att.date,
          status: 'SKIPPED - no checkIn',
        });
        skipped++;
        continue;
      }

      // Build shift start time in UTC (Karachi = UTC+5)
      const [y, m, d] = att.date.split('-').map(Number);
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const shiftStartUTC = new Date(Date.UTC(y, m - 1, d, sh - 5, sm, 0));

      // Grace end = shift start + 20 minutes
      const graceEndUTC = new Date(shiftStartUTC.getTime() + GRACE_PERIOD_MIN * 60 * 1000);
      const checkInTime = new Date(att.checkIn);

      // Employee is LATE only if checkIn is AFTER the grace period ends
      const shouldBeLate = checkInTime > graceEndUTC;

      const record = {
        empCode: att.empCode,
        employeeName: att.employeeName,
        date: att.date,
        shift: att.shift,
        shiftStartTime: shift.startTime,
        shiftStartUTC: shiftStartUTC.toISOString(),
        graceEndUTC: graceEndUTC.toISOString(),
        checkIn: att.checkIn,
        checkInUTC: checkInTime.toISOString(),
        minutesAfterShift: Math.round((checkInTime - shiftStartUTC) / 60000),
        gracePeriod: GRACE_PERIOD_MIN,
        currentLate: att.late,
        shouldBeLate,
      };

      if (att.late === shouldBeLate) {
        record.action = 'CORRECT - no change needed';
        alreadyCorrect++;
      } else if (shouldBeLate && !att.late) {
        record.action = 'FIXED -> set LATE (was incorrectly NOT late)';
        fixedToLate++;
        if (!dryRun) {
          att.late = true;
          await att.save();
        }
      } else {
        record.action = 'FIXED -> removed LATE (was incorrectly late)';
        fixedToNotLate++;
        if (!dryRun) {
          att.late = false;
          await att.save();
        }
      }

      results.push(record);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      gracePeriodMinutes: GRACE_PERIOD_MIN,
      shiftsFix: {
        message: 'All shifts set to ' + GRACE_PERIOD_MIN + '-minute grace period',
        updated: shiftUpdateResult.modifiedCount,
        before: shiftsBefore.map(s => ({ code: s.code, name: s.name, gracePeriod: s.gracePeriod })),
        after: shiftsAfter.map(s => ({ code: s.code, name: s.name, gracePeriod: s.gracePeriod })),
      },
      attendanceFix: {
        totalRecords: allAttendance.length,
        alreadyCorrect,
        fixedToLate,
        fixedToNotLate,
        skipped,
        message: dryRun
          ? 'DRY RUN: Would fix ' + (fixedToLate + fixedToNotLate) + ' records (' + fixedToLate + ' to LATE, ' + fixedToNotLate + ' to NOT LATE)'
          : 'Fixed ' + (fixedToLate + fixedToNotLate) + ' records (' + fixedToLate + ' to LATE, ' + fixedToNotLate + ' to NOT LATE)',
      },
      details: results,
    });
  } catch (err) {
    console.error('Fix attendance error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
