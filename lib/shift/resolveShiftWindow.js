// lib/shift/resolveShiftWindow.js
// Resolves the current shift window for an employee based on their assigned shift.
// Handles day shifts, night shifts (crossesMidnight), grace periods, and Asia/Karachi timezone.

import Employee from '@/models/Employee';
import Shift from '@/models/Shift';

const TZ = 'Asia/Karachi';

// ─── Timezone Helpers ────────────────────────────────────────────

/**
 * Get the current date string (YYYY-MM-DD) in Asia/Karachi.
 */
function getKarachiDateStr(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ }); // "YYYY-MM-DD"
}

/**
 * Add/subtract days from a date string.
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {number} days positive or negative
 * @returns {string} "YYYY-MM-DD"
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC to avoid DST edge
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a JS Date for a given wall-clock time in Asia/Karachi.
 * Pakistan Standard Time = UTC+5 (no DST).
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string} timeStr "HH:mm"
 * @returns {Date}
 */
function buildKarachiDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  // Karachi wall-clock → UTC: subtract 5 hours
  return new Date(Date.UTC(y, m - 1, d, h - 5, min, 0, 0));
}

// ─── Main Resolver ───────────────────────────────────────────────

/**
 * Resolve the shift window for an employee at a given moment.
 *
 * @param {string} empCode - Employee code
 * @param {Date}   [now=new Date()] - Current timestamp (used for testing)
 * @returns {Promise<{
 *   emp: Object,
 *   shift: Object,
 *   shiftStart: Date,
 *   shiftEnd: Date,
 *   attendanceDate: string
 * }>}
 */
export async function resolveShiftWindow(empCode, now = new Date()) {
  // 1) Load employee
  const emp = await Employee.findOne({ empCode: empCode.trim() })
    .select('empCode name department designation shift shiftId')
    .lean();

  if (!emp) {
    throw new Error(`Employee not found: ${empCode}`);
  }

  // 2) Resolve shift: prefer shiftId (populated), fallback to shift code string
  let shift = null;

  if (emp.shiftId) {
    shift = await Shift.findById(emp.shiftId).lean();
  }

  if (!shift && emp.shift) {
    shift = await Shift.findOne({ code: emp.shift.toUpperCase().trim() }).lean();
  }

  if (!shift) {
    throw new Error(`No shift configured for employee ${empCode}`);
  }

  // 3) Current Karachi date
  const karachiToday = getKarachiDateStr(now);
  const karachiYesterday = addDays(karachiToday, -1);

  // 4) Compute shift window
  if (shift.crossesMidnight) {
    // ── Night shift ──────────────────────────────────────────
    // Two possible windows to check:
    //
    // Window A: shift started TODAY, ends TOMORROW
    //   e.g. now=Feb10 23:00, shift 22:00–06:00 → start=Feb10 22:00, end=Feb11 06:00
    //
    // Window B: shift started YESTERDAY, ends TODAY
    //   e.g. now=Feb11 03:00, shift 22:00–06:00 → start=Feb10 22:00, end=Feb11 06:00

    // Window A: started today
    const startA = buildKarachiDate(karachiToday, shift.startTime);
    const endA = buildKarachiDate(addDays(karachiToday, 1), shift.endTime);

    if (now >= startA && now <= endA) {
      return {
        emp,
        shift,
        shiftStart: startA,
        shiftEnd: endA,
        attendanceDate: karachiToday, // shift START date
      };
    }

    // Window B: started yesterday
    const startB = buildKarachiDate(karachiYesterday, shift.startTime);
    const endB = buildKarachiDate(karachiToday, shift.endTime);

    if (now >= startB && now <= endB) {
      return {
        emp,
        shift,
        shiftStart: startB,
        shiftEnd: endB,
        attendanceDate: karachiYesterday, // shift START date (yesterday)
      };
    }

    // Not inside any active window → return the next upcoming window
    if (now < startA) {
      // Before tonight's shift
      return {
        emp,
        shift,
        shiftStart: startA,
        shiftEnd: endA,
        attendanceDate: karachiToday,
      };
    }

    // Past both windows → tomorrow's shift
    const karachiTomorrow = addDays(karachiToday, 1);
    return {
      emp,
      shift,
      shiftStart: buildKarachiDate(karachiTomorrow, shift.startTime),
      shiftEnd: buildKarachiDate(addDays(karachiTomorrow, 1), shift.endTime),
      attendanceDate: karachiTomorrow,
    };
  } else {
    // ── Day shift ────────────────────────────────────────────
    const shiftStart = buildKarachiDate(karachiToday, shift.startTime);
    const shiftEnd = buildKarachiDate(karachiToday, shift.endTime);

    return {
      emp,
      shift,
      shiftStart,
      shiftEnd,
      attendanceDate: karachiToday,
    };
  }
}
