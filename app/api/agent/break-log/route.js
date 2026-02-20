// app/api/agent/break-log/route.js
//
// HYBRID BREAK FLOW (3 steps):
//   Step 1 — POST:  Form appears → create OPEN break (startedAt = now, reason = "Pending")
//   Step 2 — PATCH: Form submitted → update reason on the open break (action: "update-reason")
//   Step 3 — PATCH: Employee becomes ACTIVE → close break (endedAt = now) (action: "end-break")
//
// This captures the FULL idle time: from form appearing to actual work resuming.

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Device from '@/models/Device';
import BreakLog from '@/models/BreakLog';
import Employee from '@/models/Employee';
import Shift from '@/models/Shift';
import { verifyToken } from '@/lib/security/tokens';
import { resolveShiftWindow, computeShiftWindowForDate } from '@/lib/shift/resolveShiftWindow';

// ── Helper: Authenticate device ──────────────────────────────────
async function authDevice(deviceId, deviceToken, empCode) {
  const device = await Device.findOne({
    deviceId,
    empCode: empCode.trim(),
    isRevoked: false,
  });
  if (!device) return null;
  if (!verifyToken(deviceToken, device.deviceTokenHash)) return null;
  return device;
}

// ── POST: Step 1 — Open a break when the idle form appears ──────
export async function POST(request) {
  try {
    const body = await request.json();
    const { deviceId, deviceToken, empCode, reason, customReason, startedAt } = body;

    if (!deviceId || !deviceToken || !empCode) {
      return NextResponse.json(
        { error: 'deviceId, deviceToken, and empCode are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const device = await authDevice(deviceId, deviceToken, empCode);
    if (!device) {
      return NextResponse.json({ error: 'Device not found or invalid token' }, { status: 401 });
    }

    // Get employee info (includes shift fields for window clipping)
    const emp = await Employee.findOne({ empCode: empCode.trim() })
      .select('name department shift shiftId')
      .lean();

    // Resolve shift for attendanceDate
    let shiftInfo = {};
    try {
      const window = await resolveShiftWindow(empCode, new Date());
      shiftInfo = { date: window.attendanceDate, shift: window.shift.code };
    } catch {
      shiftInfo = {
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }),
        shift: '',
      };
    }

    // Close ALL existing open breaks (safety net — prevents duplicates & orphans)
    // Clip to shift window so orphans don't accumulate hours outside the shift.
    let clipShift = null;
    try {
      if (emp?.shiftId) clipShift = await Shift.findById(emp.shiftId).lean();
      if (!clipShift && emp?.shift) clipShift = await Shift.findOne({ code: emp.shift.toUpperCase().trim() }).lean();
    } catch { /* non-fatal */ }

    const openBreaks = await BreakLog.find({ empCode: empCode.trim(), endedAt: null });
    const closeTime = new Date();
    for (const ob of openBreaks) {
      ob.endedAt = closeTime;
      if (clipShift && ob.date) {
        try {
          const win = computeShiftWindowForDate(clipShift, ob.date);
          if (ob.endedAt > win.graceEnd) ob.endedAt = win.graceEnd;
          if (ob.startedAt < win.graceStart) ob.startedAt = win.graceStart;
        } catch { /* non-fatal */ }
      }
      ob.durationMin = Math.max(0, Math.round((ob.endedAt - ob.startedAt) / 60000));
      await ob.save();
    }

    // Create new OPEN break
    const now = new Date();
    const breakStartedAt = startedAt ? new Date(startedAt) : now;

    const breakLog = await BreakLog.create({
      empCode: empCode.trim(),
      employeeName: emp?.name || '',
      department: emp?.department || '',
      date: shiftInfo.date,
      shift: shiftInfo.shift,
      reason: reason || 'Pending',             // "Pending" until employee submits the form
      customReason: customReason || 'Pending',
      startedAt: breakStartedAt,
      endedAt: null,                            // OPEN — waiting for employee to become ACTIVE
      durationMin: 0,
      deviceId,
    });

    return NextResponse.json({
      ok: true,
      breakLogId: breakLog._id,
      message: 'Break opened (form appeared)',
    });
  } catch (err) {
    console.error('Break log POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH: Step 2 or Step 3 ──────────────────────────────────────
//   action: "update-reason" → Step 2 (form submitted, save reason)
//   action: "end-break"     → Step 3 (employee active, close break)
//   (no action / legacy)    → Step 3 (backward compat: close break)
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { deviceId, deviceToken, empCode, action, reason, customReason } = body;

    if (!deviceId || !deviceToken || !empCode) {
      return NextResponse.json(
        { error: 'deviceId, deviceToken, and empCode are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const device = await authDevice(deviceId, deviceToken, empCode);
    if (!device) {
      return NextResponse.json({ error: 'Device not found or invalid token' }, { status: 401 });
    }

    // Find the open break for this employee
    const openBreak = await BreakLog.findOne({ empCode: empCode.trim(), endedAt: null });

    if (!openBreak) {
      return NextResponse.json({ ok: true, message: 'No open break found' });
    }

    // ── Step 2: Update reason (form was submitted) ────────────
    if (action === 'update-reason') {
      if (!reason || !customReason) {
        return NextResponse.json(
          { error: 'reason and customReason are required for update-reason' },
          { status: 400 }
        );
      }

      openBreak.reason = reason;
      openBreak.customReason = customReason;
      await openBreak.save();

      return NextResponse.json({
        ok: true,
        message: `Break reason updated: ${reason}`,
        breakLogId: openBreak._id,
      });
    }

    // ── Step 3: End break (employee became ACTIVE) ────────────
    // Also handles legacy agents that don't send "action"
    openBreak.endedAt = new Date();

    // Clip break to the shift+grace window so downtime outside the
    // shift is never counted (e.g. power-off recovery spanning hours
    // past shift end).
    try {
      const emp = await Employee.findOne({ empCode: empCode.trim() })
        .select('shift shiftId').lean();
      let shift = null;
      if (emp?.shiftId) shift = await Shift.findById(emp.shiftId).lean();
      if (!shift && emp?.shift) shift = await Shift.findOne({ code: emp.shift.toUpperCase().trim() }).lean();

      if (shift && openBreak.date) {
        const win = computeShiftWindowForDate(shift, openBreak.date);
        if (openBreak.endedAt > win.graceEnd) openBreak.endedAt = win.graceEnd;
        if (openBreak.startedAt < win.graceStart) openBreak.startedAt = win.graceStart;
      }
    } catch (clipErr) {
      console.error('Shift clip warning (non-fatal):', clipErr.message);
    }

    openBreak.durationMin = Math.max(0, Math.round(
      (openBreak.endedAt - openBreak.startedAt) / 60000
    ));
    await openBreak.save();

    return NextResponse.json({
      ok: true,
      message: `Break ended: ${openBreak.reason} (${openBreak.durationMin} min)`,
      durationMin: openBreak.durationMin,
    });
  } catch (err) {
    console.error('Break log PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
