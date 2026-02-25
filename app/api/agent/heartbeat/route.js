// app/api/agent/heartbeat/route.js
// Receives heartbeats from the Python desktop agent.
// Authenticates device, resolves shift, auto-creates attendance on first ACTIVE.
// Also processes activityScore for anti-auto-clicker detection.

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Device from '@/models/Device';
import ShiftAttendance from '@/models/ShiftAttendance';
import SuspiciousLog from '@/models/SuspiciousLog';
import { verifyToken } from '@/lib/security/tokens';
import { resolveShiftWindow } from '@/lib/shift/resolveShiftWindow';

const SUSPICIOUS_THRESHOLD = 30; // Score below this = suspicious

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      deviceId, deviceToken, empCode, state,
      activityScore, autoClickerDetected,
    } = body;

    // ── Validate input ──────────────────────────────────────
    if (!deviceId || !deviceToken || !empCode) {
      return NextResponse.json(
        { error: 'deviceId, deviceToken, and empCode are required' },
        { status: 400 }
      );
    }
    if (!['ACTIVE', 'IDLE', 'SUSPICIOUS'].includes(state)) {
      return NextResponse.json(
        { error: 'state must be ACTIVE, IDLE, or SUSPICIOUS' },
        { status: 400 }
      );
    }

    await connectDB();

    // ── Authenticate device ─────────────────────────────────
    const device = await Device.findOne({
      deviceId,
      empCode: empCode.trim(),
      isRevoked: false,
    });

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found or revoked' },
        { status: 401 }
      );
    }

    if (!verifyToken(deviceToken, device.deviceTokenHash)) {
      return NextResponse.json(
        { error: 'Invalid device token' },
        { status: 401 }
      );
    }

    // ── Update device status + activity score ────────────────
    const now = new Date();
    device.lastSeenAt = now;

    let effectiveState = state;
    const score = typeof activityScore === 'number' ? Math.round(activityScore) : null;

    if (score !== null) {
      device.lastActivityScore = score;
    }

    // Agent sends SUSPICIOUS when auto-clicker detected or score < 30
    if (state === 'SUSPICIOUS' || autoClickerDetected) {
      effectiveState = 'SUSPICIOUS';
      device.suspiciousCount = (device.suspiciousCount || 0) + 1;
    } else if (state === 'ACTIVE' && score !== null && score < SUSPICIOUS_THRESHOLD) {
      effectiveState = 'SUSPICIOUS';
      device.suspiciousCount = (device.suspiciousCount || 0) + 1;
    } else if (state === 'ACTIVE') {
      device.suspiciousCount = 0;
    }

    device.lastState = effectiveState;
    await device.save();

    // ── Resolve shift window ────────────────────────────────
    let shiftWindow;
    try {
      shiftWindow = await resolveShiftWindow(empCode, now);
    } catch (err) {
      // If no shift found, still accept heartbeat (device is alive)
      return NextResponse.json({
        ok: true,
        warning: err.message,
        attendance: null,
      });
    }

    const { emp, shift, shiftStart, shiftEnd, attendanceDate } = shiftWindow;

    // ── Log suspicious activity ──────────────────────────────
    if (effectiveState === 'SUSPICIOUS' && score !== null) {
      try {
        await SuspiciousLog.create({
          empCode: empCode.trim(),
          deviceId,
          date: attendanceDate,
          activityScore: score,
          severity: score < 10 ? 'CRITICAL' : 'WARNING',
          detectedAt: now,
        });
      } catch (logErr) {
        console.error('Failed to create suspicious log:', logErr);
      }
    }

    // ── Update ShiftAttendance with score data ───────────────
    // Track average score and suspicious minutes for the day

    // ── Upsert ShiftAttendance ──────────────────────────────
    // Find or create today's attendance record for this employee + shift
    const filter = {
      date: attendanceDate,
      empCode: empCode.trim(),
      shift: shift.code,
    };

    let attendance = await ShiftAttendance.findOne(filter);

    // Grace period: use ?? (nullish coalescing) so an explicit 0 is respected
    const gracePeriodMin = shift.gracePeriod ?? 20;
    const graceEnd = new Date(shiftStart.getTime() + gracePeriodMin * 60 * 1000);
    const earlyLeaveBoundary = new Date(shiftEnd.getTime() - gracePeriodMin * 60 * 1000);
    const isCheckInState = ['ACTIVE', 'IDLE', 'SUSPICIOUS'].includes(state);

    if (!attendance) {
      // First heartbeat for this shift day — create the record
      const isLate = isCheckInState && now > graceEnd;

      attendance = await ShiftAttendance.create({
        date: attendanceDate,
        empCode: empCode.trim(),
        employeeName: emp.name || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: shift.code,
        checkIn: isCheckInState ? now : null,
        checkOut: null,
        totalPunches: isCheckInState ? 1 : 0,
        attendanceStatus: isCheckInState ? 'Present' : null,
        late: isLate,
        earlyLeave: false,
      });

      return NextResponse.json({
        ok: true,
        action: isCheckInState ? 'checked-in' : 'record-created',
        attendance: {
          date: attendance.date,
          empCode: attendance.empCode,
          shift: attendance.shift,
          checkIn: attendance.checkIn,
          attendanceStatus: attendance.attendanceStatus,
          late: attendance.late,
        },
      });
    }

    // Record already exists — update only if needed
    if (isCheckInState && !attendance.checkIn) {
      // First in-shift heartbeat (ACTIVE/IDLE/SUSPICIOUS) — set checkIn
      const isLate = now > graceEnd;

      attendance.checkIn = now;
      attendance.attendanceStatus = 'Present';
      attendance.late = isLate;
      attendance.totalPunches = (attendance.totalPunches || 0) + 1;
      await attendance.save();

      return NextResponse.json({
        ok: true,
        action: 'checked-in',
        attendance: {
          date: attendance.date,
          empCode: attendance.empCode,
          shift: attendance.shift,
          checkIn: attendance.checkIn,
          attendanceStatus: attendance.attendanceStatus,
          late: attendance.late,
        },
      });
    }

    // Keep early-leave flag aligned with Shift Manager grace if checkOut exists.
    if (attendance.checkOut) {
      const computedEarly = attendance.checkOut < earlyLeaveBoundary;
      if (computedEarly !== attendance.earlyLeave) {
        attendance.earlyLeave = computedEarly;
        await attendance.save();
      }
    }

    // Already checked in — update activity score tracking
    if (score !== null && (state === 'ACTIVE' || state === 'SUSPICIOUS')) {
      attendance._scoreSum = (attendance._scoreSum || 0) + score;
      attendance._scoreCount = (attendance._scoreCount || 0) + 1;
      attendance.avgActivityScore = Math.round(attendance._scoreSum / attendance._scoreCount);

      if (effectiveState === 'SUSPICIOUS') {
        // Each heartbeat interval ≈ 3 min
        attendance.suspiciousMinutes = (attendance.suspiciousMinutes || 0) + 3;
      }

      await attendance.save();
    }

    return NextResponse.json({
      ok: true,
      action: 'heartbeat-ack',
      attendance: {
        date: attendance.date,
        empCode: attendance.empCode,
        shift: attendance.shift,
        checkIn: attendance.checkIn,
        attendanceStatus: attendance.attendanceStatus,
        late: attendance.late,
        avgActivityScore: attendance.avgActivityScore,
        suspiciousMinutes: attendance.suspiciousMinutes,
      },
    });
  } catch (err) {
    console.error('Heartbeat error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
