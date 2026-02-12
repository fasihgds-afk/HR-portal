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
const FLAG_AFTER_COUNT = 3;      // Flag device after N consecutive suspicious heartbeats

export async function POST(request) {
  try {
    const body = await request.json();
    const { deviceId, deviceToken, empCode, state, activityScore } = body;

    // ── Validate input ──────────────────────────────────────
    if (!deviceId || !deviceToken || !empCode) {
      return NextResponse.json(
        { error: 'deviceId, deviceToken, and empCode are required' },
        { status: 400 }
      );
    }
    if (!['ACTIVE', 'IDLE'].includes(state)) {
      return NextResponse.json(
        { error: 'state must be "ACTIVE" or "IDLE"' },
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

    // Determine effective state based on activity score
    let effectiveState = state;
    const score = typeof activityScore === 'number' ? Math.round(activityScore) : null;

    if (score !== null) {
      device.lastActivityScore = score;

      if (state === 'ACTIVE' && score < SUSPICIOUS_THRESHOLD) {
        // Low score while "ACTIVE" = suspicious
        effectiveState = 'SUSPICIOUS';
        device.suspiciousCount = (device.suspiciousCount || 0) + 1;

        // Auto-flag after consecutive suspicious heartbeats
        if (device.suspiciousCount >= FLAG_AFTER_COUNT) {
          device.flagged = true;
        }
      } else {
        // Good score — reset consecutive counter
        device.suspiciousCount = 0;
      }
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

    if (!attendance) {
      // First heartbeat for this shift day — create the record
      const isLate = state === 'ACTIVE' && now > graceEnd;

      attendance = await ShiftAttendance.create({
        date: attendanceDate,
        empCode: empCode.trim(),
        employeeName: emp.name || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: shift.code,
        checkIn: state === 'ACTIVE' ? now : null,
        checkOut: null,
        totalPunches: state === 'ACTIVE' ? 1 : 0,
        attendanceStatus: state === 'ACTIVE' ? 'Present' : null,
        late: isLate,
        earlyLeave: false,
      });

      return NextResponse.json({
        ok: true,
        action: state === 'ACTIVE' ? 'checked-in' : 'record-created',
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
    if (state === 'ACTIVE' && !attendance.checkIn) {
      // First ACTIVE signal today — set checkIn
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

    // Already checked in — update activity score tracking
    if (score !== null && state === 'ACTIVE') {
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
