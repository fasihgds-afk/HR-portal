// app/api/monitor/productivity/route.js
// HR Admin + Employee: View productivity (hours worked, break time, etc.)
//
// Break Allowance Rules (per shift):
//   Official    → counts as PRODUCTIVE (0 deduction)
//   Personal    → 60 min allowed, excess is deducted
//   Namaz       → 20 min allowed, excess is deducted
//   Others      → fully deducted (no allowance)
//
// GET ?date=2026-02-10                     → all employees for that date
// GET ?empCode=00002                       → auto-detect correct shift date
// GET ?empCode=00002&date=2026-02-10       → specific employee + date
// GET ?mode=live                           → all active employees (today + yesterday for night shifts)

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import ShiftAttendance from '@/models/ShiftAttendance';
import BreakLog from '@/models/BreakLog';
import Shift from '@/models/Shift';
import Device from '@/models/Device';
import { resolveShiftWindow } from '@/lib/shift/resolveShiftWindow';

const TZ = 'Asia/Karachi';
const OFFLINE_THRESHOLD_SEC = 180;

// Break allowance limits (minutes per day)
const BREAK_ALLOWANCE = {
  'Official':       Infinity, // Fully productive — no deduction
  'Personal Break': 60,       // 1 hour allowed
  'Namaz':          20,       // 20 minutes allowed
  'Others':         0,        // No allowance — fully deducted
};

function getBreakDuration(b, now) {
  if (b.endedAt) return Math.max(0, b.durationMin || 0);
  return Math.max(0, Math.round((now - new Date(b.startedAt).getTime()) / 60000));
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const empCode = searchParams.get('empCode');
    const mode = searchParams.get('mode'); // 'live' = show all active shifts

    await connectDB();

    // ── Smart date resolution ────────────────────────────────
    let date;

    if (empCode && !dateParam) {
      // Auto-detect the correct attendance date for this employee's shift
      try {
        const sw = await resolveShiftWindow(empCode.trim(), new Date());
        date = sw.attendanceDate;
      } catch {
        date = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
      }
    } else {
      date = dateParam || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    }

    // ── Build attendance filter ──────────────────────────────
    let attFilter;

    if (mode === 'live') {
      // For HR live monitoring: show today + yesterday (catches night shifts)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
      const yesterday = addDays(today, -1);
      attFilter = { date: { $in: [today, yesterday] } };
    } else {
      attFilter = { date };
    }

    if (empCode) attFilter.empCode = empCode.trim();

    let attendances = await ShiftAttendance.find(attFilter)
      .sort({ empCode: 1, date: -1 })
      .lean();

    if (attendances.length === 0) {
      return NextResponse.json({ date, employees: [], count: 0 });
    }

    // For live mode: deduplicate — keep the most recent record per employee
    // (night shift worker might have yesterday's record still active)
    if (mode === 'live') {
      const seen = new Map();
      for (const att of attendances) {
        const existing = seen.get(att.empCode);
        if (!existing) {
          seen.set(att.empCode, att);
        } else {
          // Keep the one that is still active (no checkOut) or the most recent
          if (!att.checkOut && existing.checkOut) {
            seen.set(att.empCode, att);
          } else if (att.date > existing.date) {
            seen.set(att.empCode, att);
          }
        }
      }
      attendances = [...seen.values()];
    }

    const empCodes = [...new Set(attendances.map(a => a.empCode))];
    // Fetch break logs for all relevant dates
    const dates = [...new Set(attendances.map(a => a.date))];
    const breakLogs = await BreakLog.find({ date: { $in: dates }, empCode: { $in: empCodes } }).lean();

    const shiftCodes = [...new Set(attendances.map(a => a.shift).filter(Boolean))];
    const shifts = await Shift.find({ code: { $in: shiftCodes } }).lean();
    const shiftMap = new Map(shifts.map(s => [s.code, s]));

    const devices = await Device.find({ empCode: { $in: empCodes }, isRevoked: false })
      .select('empCode lastSeenAt lastState lastActivityScore suspiciousCount flagged')
      .lean();
    const deviceMap = new Map();
    for (const d of devices) {
      const existing = deviceMap.get(d.empCode);
      if (!existing || (d.lastSeenAt && d.lastSeenAt > existing.lastSeenAt)) {
        deviceMap.set(d.empCode, d);
      }
    }

    const now = Date.now();

    const employees = attendances.map(att => {
      const shift = shiftMap.get(att.shift);
      const empBreaks = breakLogs.filter(b => b.empCode === att.empCode && b.date === att.date);
      const device = deviceMap.get(att.empCode);

      // Shift duration
      let shiftDurationMin = 0;
      if (shift) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (shift.crossesMidnight && endMin <= startMin) endMin += 24 * 60;
        shiftDurationMin = endMin - startMin;
      }

      // Hours worked: checkIn → checkOut (or now)
      let totalWorkedMin = 0;
      if (att.checkIn) {
        const checkInTime = new Date(att.checkIn).getTime();
        const checkOutTime = att.checkOut ? new Date(att.checkOut).getTime() : now;
        totalWorkedMin = Math.round((checkOutTime - checkInTime) / 60000);
      }

      // ── Break analysis by category ─────────────────────
      let officialMin = 0;
      let personalMin = 0;
      let namazMin = 0;
      let othersMin = 0;
      let totalBreakMin = 0;

      for (const b of empBreaks) {
        const dur = getBreakDuration(b, now);
        totalBreakMin += dur;

        switch (b.reason) {
          case 'Official':       officialMin += dur; break;
          case 'Personal Break': personalMin += dur; break;
          case 'Namaz':          namazMin += dur; break;
          default:               othersMin += dur; break;
        }
      }

      // ── Calculate deductions using allowance rules ─────
      // Official: 0 deduction (counts as productive)
      const officialDeducted = 0;

      // Personal: first 60 min free, excess deducted
      const personalAllowed = Math.min(personalMin, BREAK_ALLOWANCE['Personal Break']);
      const personalExcess = Math.max(0, personalMin - BREAK_ALLOWANCE['Personal Break']);

      // Namaz: first 40 min free, excess deducted
      const namazAllowed = Math.min(namazMin, BREAK_ALLOWANCE['Namaz']);
      const namazExcess = Math.max(0, namazMin - BREAK_ALLOWANCE['Namaz']);

      // Others: fully deducted
      const othersDeducted = othersMin;

      // Total deducted = only the excess + others
      const totalDeductedMin = personalExcess + namazExcess + othersDeducted;

      // Allowed (non-deducted) break time
      const allowedBreakMin = officialMin + personalAllowed + namazAllowed;

      // Productive = worked - deductions
      const productiveMin = Math.max(0, totalWorkedMin - totalDeductedMin);

      // Consistent rounding for display
      const shiftDurationHrs = +(shiftDurationMin / 60).toFixed(1);
      const totalWorkedHrs = +(totalWorkedMin / 60).toFixed(1);
      const totalBreakHrs = +(totalBreakMin / 60).toFixed(1);
      const allowedBreakHrs = +(allowedBreakMin / 60).toFixed(1);
      const deductedBreakHrs = +(totalDeductedMin / 60).toFixed(1);
      const productiveHrs = +(productiveMin / 60).toFixed(1);

      // Productivity % (productive / shift)
      const productivityPct = shiftDurationMin > 0
        ? Math.min(100, Math.round((productiveMin / shiftDurationMin) * 100))
        : 0;

      // Live status
      let liveStatus = 'OFFLINE';
      if (device && device.lastSeenAt) {
        const secsSince = (now - new Date(device.lastSeenAt).getTime()) / 1000;
        liveStatus = secsSince > OFFLINE_THRESHOLD_SEC ? 'OFFLINE' : (device.lastState || 'IDLE');
      }

      // Activity score from attendance record (daily avg) and live from device
      const avgScore = att.avgActivityScore ?? null;
      const suspiciousMin = att.suspiciousMinutes || 0;
      const liveScore = device?.lastActivityScore ?? null;
      const isFlagged = device?.flagged || false;

      return {
        empCode: att.empCode,
        employeeName: att.employeeName || '',
        department: att.department || '',
        shift: att.shift,
        date: att.date,
        checkIn: att.checkIn,
        checkOut: att.checkOut,
        late: att.late,
        earlyLeave: att.earlyLeave,
        attendanceStatus: att.attendanceStatus,
        liveStatus,
        shiftDurationHrs,
        totalWorkedHrs,
        totalBreakHrs,
        allowedBreakHrs,
        deductedBreakHrs,
        productiveHrs,
        productivityPct,
        // Anti-auto-clicker data
        avgActivityScore: avgScore,
        liveActivityScore: liveScore,
        suspiciousMinutes: suspiciousMin,
        flagged: isFlagged,
        breakCount: empBreaks.length,
        // Category breakdown (minutes)
        breakDown: {
          official:   { totalMin: officialMin, allowedMin: officialMin, excessMin: 0 },
          personal:   { totalMin: personalMin, allowedMin: personalAllowed, excessMin: personalExcess },
          namaz:      { totalMin: namazMin,    allowedMin: namazAllowed,    excessMin: namazExcess },
          others:     { totalMin: othersMin,   allowedMin: 0,              excessMin: othersMin },
        },
        breaks: empBreaks.map(b => ({
          reason: b.reason,
          customReason: b.customReason,
          startedAt: b.startedAt,
          endedAt: b.endedAt,
          durationMin: b.durationMin || 0,
          isOpen: !b.endedAt,
        })),
      };
    });

    return NextResponse.json({
      date,
      count: employees.length,
      employees,
    });
  } catch (err) {
    console.error('Productivity API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
