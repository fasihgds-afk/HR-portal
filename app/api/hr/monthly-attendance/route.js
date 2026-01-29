// app/api/hr/monthly-attendance/route.js
//
// =============================================================================
// MONTHLY ATTENDANCE API - VIOLATION FORMULA QUICK REFERENCE
// =============================================================================
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';

import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';
//
// VIOLATION DEDUCTION FORMULA (Quick Summary):
// --------------------------------------------
// Pattern: Every 3rd violation (3, 6, 9, 12, ...) = 1 FULL DAY
//          All other violations after 3rd (4, 5, 7, 8, 10, 11, ...) = PER-MINUTE FINE
//
// Formula:
//   Full Days = floor(violationCount / 3)
//   Per-Minute Days = sum of (minutes × 0.007) for each non-milestone violation
//   Total Violation Days = Full Days + Per-Minute Days
//
// Examples:
//   - 3 violations → 1 full day
//   - 5 violations → 1 full day + (0.007 × minutes from violations #4 and #5)
//   - 8 violations → 2 full days + (0.007 × minutes from violations #4, #5, #7, #8)
//
// TOTAL SALARY DEDUCTION = Violation Days + Unpaid Leave + Absent + Half Days
//
// For detailed formula explanation, see comments in the violation calculation section
// (around line 695) and final salary calculation section (around line 904).
//
// =============================================================================

import mongoose from 'mongoose';
import { connectDB } from '../../../../lib/db';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Shift from '../../../../models/Shift';
import ViolationRules from '../../../../models/ViolationRules';
import PaidLeave from '../../../../models/PaidLeave';
import LeaveRecord from '../../../../models/LeaveRecord';
import Department from '../../../../models/Department';
import { normalizeStatus, extractShiftCode, isSaturdayOffForEmployee, getSaturdayIndexInMonth } from '../../../../lib/calculations';
import { calculateViolationDeductions, calculateTotalDeductionDays, calculateSalaryAmounts, getLeaveDeductionDays, getMissingPunchDeductionDays } from '../../../../lib/calculations';
import { memoize, createCacheKey } from '../../../../lib/utils/memoize';
// Cache removed for simplicity and real-time data
// EmployeeShiftHistory removed - using only employee's current shift assignment

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// -----------------------------------------------------------------------------
// TIMEZONE + COMPANY DAY (ends at 08:55 local)
// -----------------------------------------------------------------------------

function parseOffsetToMinutes(offsetStr) {
  if (!offsetStr) return 5 * 60; // default +05:00

  const str = String(offsetStr).trim();
  const m = /^([+-])?(\d{1,2})(?::?(\d{2}))?$/.exec(str);
  if (!m) return 5 * 60;

  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2] || '0', 10);
  const mins = parseInt(m[3] || '0', 10);
  return sign * (hours * 60 + mins);
}

// company timezone offset in minutes & ms (same on local + Vercel)
const COMPANY_OFFSET_MIN = parseOffsetToMinutes(
  process.env.TIMEZONE_OFFSET || '+05:00'
);
const COMPANY_OFFSET_MS = COMPANY_OFFSET_MIN * 60 * 1000;

// current “company day” with 08:55 cutoff in company local time
function getCompanyTodayParts() {
  const nowUtc = new Date();
  const localMs = nowUtc.getTime() + COMPANY_OFFSET_MS;
  const local = new Date(localMs);

  const h = local.getUTCHours();
  const m = local.getUTCMinutes();

  // before 08:55 → still previous company day
  if (h < 8 || (h === 8 && m < 55)) {
    local.setUTCDate(local.getUTCDate() - 1);
  }

  return {
    year: local.getUTCFullYear(),
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

// company-local date for a calendar day (YYYY-MM, day)
// PERFORMANCE: Memoized to avoid recalculating same date parts
const _getCompanyLocalDatePartsOriginal = function(year, monthIndex, day) {
  // build 00:00 UTC, then shift to company local and read UTC* fields
  const baseUtc = Date.UTC(year, monthIndex, day, 0, 0, 0);
  const local = new Date(baseUtc + COMPANY_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
    dow: local.getUTCDay(), // 0–6 in company timezone
  };
};

const getCompanyLocalDateParts = memoize(_getCompanyLocalDatePartsOriginal, (year, monthIndex, day) => {
  return `${year}-${monthIndex}-${day}`;
});

// -----------------------------------------------------------------------------
// SHIFT + LATE/EARLY RULES  (timezone-safe)
// -----------------------------------------------------------------------------

function toMinutes(h, m) {
  return h * 60 + m;
}

// Convert a stored Date (UTC internally) into minutes since midnight
// in COMPANY LOCAL time, so Vercel (UTC) and your PC (+05:00) behave the same.
function toCompanyMinutes(date) {
  const localMs = date.getTime() + COMPANY_OFFSET_MS;
  const local = new Date(localMs);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return toMinutes(h, m);
}

function isCompanySaturday(date) {
  const localMs = date.getTime() + COMPANY_OFFSET_MS;
  const local = new Date(localMs);
  return local.getUTCDay() === 6; // Saturday in company timezone
}

// Helper: Parse time string "HH:mm" to minutes
function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return toMinutes(h || 0, m || 0);
}

// getShiftForDate function removed - using only employee's current shift assignment

// Returns:
//  - late / earlyLeave flags (true/false)
//  - lateMinutes / earlyMinutes = minutes BEYOND grace period
// shift can be either a shift object (from DB) or a shift code string (legacy)
// PERFORMANCE: Memoized to avoid recalculating same shift/checkIn/checkOut combinations
const _computeLateEarlyOriginal = function(shift, checkIn, checkOut, allShiftsMap = null) {
  if (!shift || !checkIn || !checkOut) {
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // convert both punches into company-local minutes
  let inMin = toCompanyMinutes(checkIn);
  let outMin = toCompanyMinutes(checkOut);

  let startMin = 0;
  let endMin = 0;
  let rawEndMin = 0;
  let gracePeriod = 15; // default
  let crossesMidnight = false;

  // Get shift object - could be already an object or a code string
  let shiftObj = null;
  if (typeof shift === 'object' && shift.startTime) {
    shiftObj = shift;
  } else if (typeof shift === 'string' && allShiftsMap) {
    // If shift is a code string, look it up from the map
    shiftObj = allShiftsMap.get(shift);
  }

  // Saturday special case: If shift is N2 on Saturday, use N1 timing instead
  if (shiftObj && shiftObj.code === 'N2' && allShiftsMap && isCompanySaturday(checkIn)) {
    const n1Shift = allShiftsMap.get('N1');
    if (n1Shift && n1Shift.startTime) {
      shiftObj = n1Shift; // Use N1 timing for N2 on Saturday
    }
  }

  if (shiftObj && shiftObj.startTime) {
    // Use shift times from database (fully dynamic)
    startMin = parseTimeToMinutes(shiftObj.startTime);
    rawEndMin = parseTimeToMinutes(shiftObj.endTime);
    gracePeriod = shiftObj.gracePeriod || 15;
    crossesMidnight = shiftObj.crossesMidnight || false;
    
    // For midnight-crossing shifts, normalize end time
    if (crossesMidnight) {
      const startClock = startMin % (24 * 60);
      // If end time is before start time (e.g., 06:00 < 21:00 or 03:00 < 18:00), it's the next day
      if (rawEndMin < startClock) {
        endMin = rawEndMin + (24 * 60); // Normalize to next day
      } else {
        endMin = rawEndMin;
      }
    } else {
      endMin = rawEndMin;
    }
  } else {
    // Fallback: if shift not found, return no violations (shouldn't happen in normal flow)
    console.warn(`Shift not found for: ${typeof shift === 'object' ? shift?.code : shift}`);
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // if shift crosses midnight, normalise both inMin and outMin
  // For night shifts (S1: 18:00-03:00, S2: 21:00-06:00):
  // - Start time is on day 1 (e.g., 18:00 or 21:00)
  // - End time is on day 2 (e.g., 03:00 = 27:00 or 06:00 = 30:00)
  // - Check-in/out times after midnight (00:00-05:59) belong to the shift that started the previous day
  // - Early arrivals (before shift start on same day, e.g., 20:00 for S2) are on-time (green)
  if (crossesMidnight) {
    const startClock = startMin % (24 * 60); // e.g., 18:00 = 1080 or 21:00 = 1260
    const earlyMorningThreshold = 6 * 60; // 06:00 = 360 minutes (before this is next day)
    
    // Normalize check-in for midnight-crossing shifts:
    // Rule: If check-in is in early morning (00:00-05:59), it belongs to the shift that started the previous day
    //       So we normalize it by adding 24 hours to compare with the shift start time
    // Example N2 (21:00-06:00, startClock=1260):
    //   - Check-in at 20:00 (1200) → same day, early arrival → don't normalize → GREEN (1200 < 1260, early)
    //   - Check-in at 21:00 (1260) → on time → don't normalize → GREEN (1260 = 1260, on time)
    //   - Check-in at 22:46 (1366) → same day, late → don't normalize → AMBER (1366 > 1260, 106 min late)
    //   - Check-in at 02:16 (136) → next day, belongs to previous shift → normalize to 1576 → AMBER (1576 > 1260, 316 min late)
    //   - Check-in at 05:59 (359) → next day, belongs to previous shift → normalize to 1799 → AMBER (1799 > 1260, 539 min late)
    if (inMin < earlyMorningThreshold) {
      // Early morning (00:00-05:59) = belongs to shift that started previous day, normalize
      inMin += 24 * 60;
    }
    // If inMin >= earlyMorningThreshold, it's on the same day as shift start, don't normalize
    // This includes both early arrivals (inMin < startClock) and late arrivals (inMin >= startClock)
    
    // Normalize check-out: For midnight-crossing shifts, check-out should be on the same day as shift end (next day)
    // Since endMin is normalized (e.g., 1800 for 06:00), we need to normalize outMin to match
    // Normalize check-out if it's in early morning (00:00-08:00) - this covers all normal check-out scenarios
    // Check-outs after 08:00 are likely data errors or very unusual cases
    // Example S2 (ends 06:00 = 1800 normalized):
    //   - Check-out at 05:48 (348) → normalize to 1788 → earlyMinutes = 1800-1788 = 12 ✓
    //   - Check-out at 06:00 (360) → normalize to 1800 → earlyMinutes = 1800-1800 = 0 ✓
    //   - Check-out at 06:15 (375) → normalize to 1815 → earlyMinutes = 1800-1815 = -15 → 0 ✓
    //   - Check-out at 07:00 (420) → normalize to 1860 → earlyMinutes = 1800-1860 = -60 → 0 ✓
    const maxCheckOutWindow = 8 * 60; // 08:00 = 480 minutes (reasonable upper bound for night shift check-outs)
    if (outMin < maxCheckOutWindow) {
      // Check-out is in early morning window (00:00-07:59) → normalize to next day
      outMin += 24 * 60;
    }
    // If outMin >= maxCheckOutWindow, it's after 08:00 (unusual case, might be data error)
    
    // Also normalize endMin if needed (endMin is already stored as next day time like 27:00 or 30:00)
    // For S1: endMin = 27:00 (03:00 next day) = 1620 minutes
    // For S2: endMin = 30:00 (06:00 next day) = 1800 minutes
    // These are already normalized, so we just need to ensure outMin is normalized too
  }

  // Calculate late: how many minutes after shift start
  // POLICY FOR ALL SHIFTS:
  // - Check-in BEFORE shift start time → GREEN (early arrival is fine, not late)
  // - Check-in AT or AFTER shift start time, but within grace period (≤gracePeriod min) → GREEN (on-time)
  // - Check-in AFTER shift start + grace period (>gracePeriod min) → AMBER (violation - late arrival)
  // Example: Shift 21:00, grace 15min
  //   - Check-in at 20:40 (20 min early) → GREEN (lateMinutesTotal = 0, late = false)
  //   - Check-in at 21:00 (on time) → GREEN (lateMinutesTotal = 0, late = false)
  //   - Check-in at 21:15 (15 min late, within grace) → GREEN (lateMinutesTotal = 15, late = false)
  //   - Check-in at 21:16 (16 min late, exceeds grace) → AMBER (lateMinutesTotal = 16, late = true)
  let lateMinutesTotal = inMin - startMin;
  // Early arrival (negative value) means on-time, set to 0
  if (lateMinutesTotal < 0) lateMinutesTotal = 0;

  // Calculate early: how many minutes before shift end
  // For night shifts crossing midnight, endMin is already normalized (27:00 or 30:00)
  // POLICY FOR ALL SHIFTS:
  // - Check-out AT or AFTER shift end time → GREEN (stayed late, which is fine)
  // - Check-out BEFORE shift end time, but within grace period (≥gracePeriod min before end) → GREEN (on-time)
  // - Check-out BEFORE shift end - grace period (<gracePeriod min before end) → ORANGE (violation - early departure)
  // Example: Shift ends 06:00, grace 15min (so grace boundary is 05:45)
  //   - Check-out at 06:30 (30 min late) → GREEN (earlyMinutesTotal = 0, earlyLeave = false)
  //   - Check-out at 06:00 (on time) → GREEN (earlyMinutesTotal = 0, earlyLeave = false)
  //   - Check-out at 05:45 (15 min early, at grace boundary) → GREEN (earlyMinutesTotal = 15, earlyLeave = false)
  //   - Check-out at 05:44 (16 min early, exceeds grace) → ORANGE (earlyMinutesTotal = 16, earlyLeave = true)
  let earlyMinutesTotal = endMin - outMin;
  // Late departure (negative value) means on-time, set to 0
  if (earlyMinutesTotal < 0) earlyMinutesTotal = 0;

  // Determine violations: only if minutes exceed grace period
  // Note: earlyMinutesTotal = 0 means on-time or late (both are GREEN)
  //       lateMinutesTotal = 0 means on-time or early (both are GREEN)
  const late = lateMinutesTotal > gracePeriod;
  const earlyLeave = earlyMinutesTotal > gracePeriod;

  // Violation minutes = minutes AFTER grace
  const lateMinutes = late ? lateMinutesTotal - gracePeriod : 0;
  const earlyMinutes = earlyLeave ? earlyMinutesTotal - gracePeriod : 0;

  return { late, earlyLeave, lateMinutes, earlyMinutes };
};

// Memoize computeLateEarly for performance (same shift/checkIn/checkOut = same result)
const computeLateEarly = memoize(_computeLateEarlyOriginal, (shift, checkIn, checkOut) => {
  const shiftKey = typeof shift === 'object' ? shift.code || shift._id : shift;
  const checkInKey = checkIn instanceof Date ? checkIn.getTime() : checkIn;
  const checkOutKey = checkOut instanceof Date ? checkOut.getTime() : checkOut;
  return createCacheKey(shiftKey, checkInKey, checkOutKey);
});

// YYYY-MM-DD from a Date, using UTC fields so server timezone doesn't matter
function toYMD(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${m}-${d}`;
}

// REMOVED: Duplicate extractShiftCode function - now using imported from lib/calculations
// This function is kept for reference but should not be used
// Use: import { extractShiftCode } from '../../../../lib/calculations';
function _extractShiftCode_DEPRECATED(shiftStr) {
  if (!shiftStr || typeof shiftStr !== 'string') return shiftStr || '';
  
  // Trim whitespace
  shiftStr = shiftStr.trim();
  
  // If it's already a simple code like "D1", "S2", etc., return it
  if (/^[A-Z]\d+$/.test(shiftStr)) {
    return shiftStr;
  }
  
  // Try to extract code from formatted strings like "– S2 (21:00–06:00)" or "S2 (21:00–06:00)"
  // Look for pattern: optional dash/space, then letter+number, then optional parentheses
  const match = shiftStr.match(/(?:–\s*)?([A-Z]\d+)(?:\s*\([^)]+\))?/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If no pattern matches, return as-is (might be a valid code we don't recognize)
  return shiftStr;
}

// -----------------------------------------------------------------------------
// STATUS NORMALISATION
// -----------------------------------------------------------------------------

// REMOVED: Duplicate normalizeStatus function - now using imported from lib/calculations
// This function is kept for reference but should not be used
// Use: import { normalizeStatus } from '../../../../lib/calculations';
function _normalizeStatus_DEPRECATED(rawStatus, { isWeekendOff } = {}) {
  let s = (rawStatus || '').trim();
  if (!s) {
    if (isWeekendOff) return 'Holiday';
    return 'Absent';
  }

  const lower = s.toLowerCase();

  if (lower === 'present' || lower === 'p') return 'Present';
  if (lower === 'holiday' || lower === 'h' || lower === 'off') return 'Holiday';
  if (lower === 'absent' || lower === 'a' || lower === 'no punch') return 'Absent';

  if (lower === 'sick leave' || lower === 'sl') {
    return 'Sick Leave';
  }
  if (lower === 'paid leave' || lower === 'pl') {
    return 'Paid Leave';
  }
  if (lower === 'un paid leave' || lower === 'unpaid leave' || lower === 'upl') {
    return 'Un Paid Leave';
  }
  if (lower === 'leave without inform' || lower === 'lwi' || lower === 'leave without info') {
    return 'Leave Without Inform';
  }
  if (lower === 'work from home' || lower === 'wfh') {
    return 'Work From Home';
  }
  if (lower === 'half day' || lower === 'half') {
    return 'Half Day';
  }

  return s;
}

// -----------------------------------------------------------------------------
// GET /api/hr/monthly-attendance?month=YYYY-MM
// -----------------------------------------------------------------------------

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    let month = searchParams.get('month');

    if (!month) {
      const now = new Date();
      month = now.toISOString().slice(0, 7); // YYYY-MM
    }

    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    if (Number.isNaN(year) || Number.isNaN(monthIndex)) {
      throw new ValidationError('Invalid "month" format. Use YYYY-MM.');
    }

    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0));
    const daysInMonth = monthEnd.getUTCDate();
    const monthPrefix = `${yearStr}-${monthStr}`;

    // company "today" in company time (with 08:55 cutoff)
    const companyToday = getCompanyTodayParts();

    let monthRelation = 0; // -1 past, 0 same, 1 future
    if (year < companyToday.year) monthRelation = -1;
    else if (year > companyToday.year) monthRelation = 1;
    else if (monthIndex < companyToday.monthIndex) monthRelation = -1;
    else if (monthIndex > companyToday.monthIndex) monthRelation = 1;
    else monthRelation = 0;

    // OPTIMIZATION: Connect DB early
    await connectDB();

    // OPTIMIZATION: Fetch violation rules with minimal fields, fast timeout
    let violationRules = await ViolationRules.findOne({ isActive: true })
      .select('violationConfig absentConfig leaveConfig salaryConfig')
      .lean()
      .maxTimeMS(1500); // Reduced timeout
    if (!violationRules) {
      // Return default rules if none exist
      violationRules = {
        violationConfig: {
          freeViolations: 2,
          milestoneInterval: 3,
          perMinuteRate: 0.007,
          maxPerMinuteFine: 1.0,
        },
        absentConfig: {
          bothMissingDays: 1.0,
          partialPunchDays: 1.0,
          leaveWithoutInformDays: 1.5,
        },
        leaveConfig: {
          unpaidLeaveDays: 1.0,
          sickLeaveDays: 1.0,
          halfDayDays: 0.5,
          paidLeaveDays: 0.0,
        },
        salaryConfig: {
          daysPerMonth: 30,
        },
      };
    }

        // OPTIMIZATION: Run queries in parallel for faster response
        // MongoDB will auto-select best index
        const [shiftCount, employees, departmentDocs] = await Promise.all([
          Shift.countDocuments({ isActive: true })
            .maxTimeMS(1500), // Reduced timeout
          Employee.find()
            .select('empCode name department designation shift shiftId monthlySalary saturdayGroup')
            .lean()
            .maxTimeMS(2500), // Reduced timeout
          Department.find().select('name saturdayPolicy').lean().maxTimeMS(1500),
        ]);
        
        const useDynamicShifts = shiftCount > 0;
        const departmentPolicyMap = new Map();
        (departmentDocs || []).forEach((d) => {
          if (d.name != null) departmentPolicyMap.set(String(d.name).trim(), d.saturdayPolicy || 'alternate');
        });

    const monthStartDate = `${monthPrefix}-01`;
    const monthEndDate = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`;

    // OPTIMIZATION: MongoDB will auto-select date index for range query
    const shiftDocs = await ShiftAttendance.find(
      {
        date: { $gte: monthStartDate, $lte: monthEndDate },
      }
    )
      .select('date empCode checkIn checkOut shift attendanceStatus reason excused lateExcused earlyExcused leaveType')
      .lean()
      .maxTimeMS(4000); // Reduced timeout for faster response

    const docsByEmpDate = new Map();
    for (const doc of shiftDocs) {
      if (!doc.empCode || !doc.date) continue;
      docsByEmpDate.set(`${doc.empCode}|${doc.date}`, doc);
    }

    // OPTIMIZATION: Pre-fetch all shifts in parallel with other queries
    const allShiftsMap = new Map();
    if (useDynamicShifts) {
      // OPTIMIZATION: Fetch shifts with minimal fields, fast timeout
      const allShifts = await Shift.find({ isActive: true })
        .select('_id name code startTime endTime crossesMidnight gracePeriod')
        .sort({ code: 1 }) // Consistent ordering
        .lean()
        .maxTimeMS(1500); // Reduced timeout
      
      allShifts.forEach((s) => {
        allShiftsMap.set(s._id.toString(), s);
        allShiftsMap.set(s.code, s); // Also index by code for quick lookup
      });
    }

    // Shift history removed - using only employee's current shift assignment

    // PERFORMANCE: Pre-calculate weekend flags for all days to avoid repeated calculations
    const weekendFlags = new Map();
    for (let day = 1; day <= daysInMonth; day++) {
      const { dow } = getCompanyLocalDateParts(year, monthIndex, day);
      weekendFlags.set(day, {
        dow,
        isSunday: dow === 0,
        isSaturday: dow === 6,
      });
    }

    const employeesOut = [];

    for (const emp of employees) {
      const empShift = emp.shift || '';
      const days = [];

      let lateCount = 0;
      let earlyCount = 0;
      let unpaidLeaveDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let missingPunchDays = 0;       // missing check-in OR check-out → 1 day
      let violationDaysCount = 0;     // number of days with a violation
      let violationBaseDays = 0;      // full days from 3rd, 6th, 9th, ...
      let perMinuteFineDays = 0;      // extra days from per-minute fine
      let totalLateMinutes = 0;       // sum of late minutes (beyond grace)
      let totalEarlyMinutes = 0;

      let saturdayIndex = 0;

      // Cache for shift lookups per employee (to avoid repeated lookups for same date)
      const shiftCache = new Map();
      let employeeShiftObj = null; // Cache employee's current shift object

      // Pre-fetch employee's current shift once (if exists and using dynamic shifts)
      if (useDynamicShifts) {
        if (emp.shiftId) {
          employeeShiftObj = allShiftsMap.get(emp.shiftId.toString());
        }
        // If shiftId lookup failed, try shift code (might be formatted string)
        if (!employeeShiftObj && emp.shift) {
          const extractedCode = extractShiftCode(emp.shift);
          employeeShiftObj = allShiftsMap.get(extractedCode);
        }
      }

      // Shift history removed - using only employee's current shift

      for (let day = 1; day <= daysInMonth; day++) {
        const dd = String(day).padStart(2, '0');
        const date = `${monthPrefix}-${dd}`;
        const key = `${emp.empCode}|${date}`;
        const doc = docsByEmpDate.get(key);

        // FUTURE days (no salary effect)
        let isFutureDay = false;
        if (monthRelation > 0) {
          isFutureDay = true;
        } else if (monthRelation === 0 && day > companyToday.day) {
          isFutureDay = true;
        }

        // PERFORMANCE: Use pre-calculated weekend flags
        const weekendInfo = weekendFlags.get(day);
        const dow = weekendInfo.dow;
        
        let isWeekendOff = false;
        if (weekendInfo.isSunday) isWeekendOff = true; // Sunday
        if (weekendInfo.isSaturday) {
          saturdayIndex++;
          if (isSaturdayOffForEmployee(saturdayIndex, emp, departmentPolicyMap, emp.department || '')) isWeekendOff = true;
        }

        // Get shift for this date - use employee's current shift assignment (simplified, no history)
        let shiftObj = shiftCache.get(date);
        let shiftCode = '';
        
        if (useDynamicShifts) {
          if (!shiftObj) {
            // Use employee's current shift object (pre-fetched, no DB query)
            if (employeeShiftObj) {
              shiftObj = employeeShiftObj;
              shiftCode = employeeShiftObj.code;
              shiftCache.set(date, shiftObj);
            } else if (doc?.shift) {
              // Fallback: Use shift from attendance record
              const normalizedShiftCode = extractShiftCode(doc.shift);
              shiftObj = allShiftsMap.get(normalizedShiftCode);
              if (shiftObj) {
                shiftCode = shiftObj.code;
                shiftCache.set(date, shiftObj);
              } else {
                shiftCode = normalizedShiftCode;
              }
            } else if (emp.shift) {
              // Last fallback: Extract shift code from employee's shift field
              const extractedCode = extractShiftCode(emp.shift);
              shiftObj = allShiftsMap.get(extractedCode);
              if (shiftObj) {
                shiftCode = shiftObj.code;
                shiftCache.set(date, shiftObj);
              } else {
                shiftCode = extractedCode;
              }
            } else {
              shiftCode = empShift || '';
            }
          } else {
            shiftCode = shiftObj.code;
          }
        } else {
          // No dynamic shifts in DB, use shift from attendance record or employee's current shift
          shiftCode = doc?.shift || empShift || '';
        }

        if (isFutureDay) {
          days.push({
            date,
            shift: shiftCode,
            status: '',
            reason: '',
            checkIn: null,
            checkOut: null,
            late: false,
            earlyLeave: false,
            excused: false,
            leaveType: null,
            isFuture: true,
          });
          continue;
        }

        const checkIn = doc?.checkIn ? new Date(doc.checkIn) : null;
        // Ensure checkOut is properly converted - handle both Date objects and ISO strings
        // Try multiple field names in case of variations
        let checkOut = null;
        const checkOutValue = doc?.checkOut || doc?.checkout || doc?.check_out;
        if (checkOutValue != null) {
          try {
            // Handle both Date objects and ISO strings
            if (checkOutValue instanceof Date) {
              checkOut = checkOutValue;
            } else if (typeof checkOutValue === 'string') {
              checkOut = new Date(checkOutValue);
            } else if (checkOutValue.constructor === Date) {
              checkOut = checkOutValue;
            }
            // Validate the date is valid
            if (checkOut && isNaN(checkOut.getTime())) {
              checkOut = null;
            }
          } catch (e) {
            checkOut = null;
          }
        }
        
        // ====================================================================================
        // NIGHT SHIFT CHECKOUT RETRIEVAL LOGIC
        // ====================================================================================
        // For night shifts that cross midnight: checkOut may be stored on the next day's record
        // since the shift ends on the next working day (e.g., Dec 26 shift 21:00-06:00 ends on Dec 27 at 06:00)
        // This logic applies to ALL night shift employees (N1, N2, S1, S2, or any shift with crossesMidnight=true)
        // 
        // Strategy:
        // 1. First try to get checkOut from current day's record (already done above)
        // 2. If checkOut is missing but checkIn exists, check next day's record
        // 3. Use next day's checkOut if it belongs to current day's night shift
        // ====================================================================================
        if (checkIn && !checkOut && day < daysInMonth) {
          // Check if this is a night shift (crosses midnight)
          const isNightShift = shiftObj?.crossesMidnight || 
                               (shiftCode && ['N1', 'N2', 'S1', 'S2'].includes(shiftCode));
          
          if (isNightShift) {
            const nextDay = day + 1;
            const nextDayStr = String(nextDay).padStart(2, '0');
            const nextDate = `${monthPrefix}-${nextDayStr}`;
            const nextKey = `${emp.empCode}|${nextDate}`;
            const nextDoc = docsByEmpDate.get(nextKey);
            
            // If next day's record has a checkOut, check if it belongs to current day's night shift
            if (nextDoc?.checkOut) {
              try {
                const nextCheckOutValue = nextDoc.checkOut || nextDoc.checkout || nextDoc.check_out;
                if (nextCheckOutValue != null) {
                  const nextCheckOut = nextCheckOutValue instanceof Date 
                    ? nextCheckOutValue 
                    : new Date(nextCheckOutValue);
                  if (!isNaN(nextCheckOut.getTime())) {
                    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';
                    const TZ_MS = TZ === '+05:00' ? 5 * 60 * 60 * 1000 : 0;
                    const checkOutLocal = new Date(nextCheckOut.getTime() + TZ_MS);
                    const checkOutHour = checkOutLocal.getUTCHours();
                    const checkOutMin = checkOutLocal.getUTCMinutes();
                    const checkOutTotalMin = checkOutHour * 60 + checkOutMin;
                    
                    // Check if next day has checkIn - if not, the checkOut definitely belongs to previous day
                    let nextDayHasCheckIn = false;
                    if (nextDoc.checkIn) {
                      try {
                        const nextCheckIn = nextDoc.checkIn instanceof Date 
                          ? nextDoc.checkIn 
                          : new Date(nextDoc.checkIn);
                        if (!isNaN(nextCheckIn.getTime())) {
                          nextDayHasCheckIn = true;
                        }
                      } catch (e) {
                        // Ignore errors
                      }
                    }
                    
                    // For night shifts: checkOut before 08:00 belongs to previous day's shift
                    // Also if next day has no checkIn, the checkOut definitely belongs to previous day
                    // Use 08:00 (480 minutes) as the cutoff - anything before this is from previous night shift
                    if (checkOutTotalMin < 480 || !nextDayHasCheckIn) {
                      checkOut = nextCheckOut;
                    } else if (nextDayHasCheckIn) {
                      // If next day has checkIn, check if checkIn is in evening (new shift) vs early morning (same shift)
                      try {
                        const nextCheckIn = nextDoc.checkIn instanceof Date 
                          ? nextDoc.checkIn 
                          : new Date(nextDoc.checkIn);
                        if (!isNaN(nextCheckIn.getTime())) {
                          const checkInLocal = new Date(nextCheckIn.getTime() + TZ_MS);
                          const checkInHour = checkInLocal.getUTCHours();
                          
                          // If checkOut is before 08:00 and checkIn is after 18:00 (evening),
                          // then checkOut belongs to previous day's night shift
                          // (checkIn is the start of the next shift)
                          if (checkOutTotalMin < 480 && checkInHour >= 18) {
                            checkOut = nextCheckOut;
                          }
                        }
                      } catch (e) {
                        // Ignore errors - fallback to not using this checkOut
                      }
                    }
                  }
                }
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
        
        // Also check: if current day has checkOut but it's after 08:00 and we have a night shift,
        // it might actually belong to the previous day. But we'll keep it for now since it's in the current record.
        
        // Debug logging for specific employees and dates to troubleshoot checkOut issues
        const shouldDebug = (emp.empCode === '812593' && (date.includes('-19') || date.includes('-24'))) ||
                            (emp.empCode === '00002' && date.includes('-26')) ||
                            (emp.empCode === '25057' && date.includes('-26'));
        
        if (shouldDebug) {
          const nextDay = day < daysInMonth ? day + 1 : null;
          const nextDayKey = nextDay ? `${emp.empCode}|${monthPrefix}-${String(nextDay).padStart(2, '0')}` : null;
          const nextDayDoc = nextDayKey ? docsByEmpDate.get(nextDayKey) : null;
        }
        
        const hasPunch = !!checkIn || !!checkOut;
        const bothMissing = !checkIn && !checkOut; // Check if both punches are missing

        // ----- AUTO STATUS LOGIC -----
        let rawStatus = doc?.attendanceStatus;
        let status;

        if (!doc) {
          // no record at all → auto by weekend
          status = isWeekendOff ? 'Holiday' : 'Absent';
        } else {
          if (rawStatus) {
            status = normalizeStatus(rawStatus, { isWeekendOff });
          } else {
            // HR did not set status; decide from punches
            // If both punches are missing, mark as Absent
            if (bothMissing && !isWeekendOff) {
              status = 'Absent';
            } else if (hasPunch) {
              status = 'Present';
            } else if (isWeekendOff) {
              status = 'Holiday';
            } else {
              status = 'Absent';
            }
          }
        }

        const reason = doc?.reason || '';
        
        // First, recalculate late/early based on current times
        let late = false;
        let earlyLeave = false;
        let dayViolationMinutes = 0;
        let lateMinutes = 0;
        let earlyMinutes = 0;

        // Late / Early calculation only if both punches and not a holiday
        // Use shiftObj (from DB) or shiftCode (legacy) for calculations
        // IMPORTANT: Check if check-in and check-out are the same time (data error)
        const sameTimePunch = checkIn && checkOut && 
          Math.abs(checkIn.getTime() - checkOut.getTime()) < 60000; // Less than 1 minute difference
        
        if (checkIn && checkOut && status !== 'Holiday' && !sameTimePunch) {
          // Use shiftObj if available, otherwise look up shift by code from allShiftsMap
          // Normalize shiftCode in case it's a formatted string
          const normalizedShiftCode = shiftCode ? extractShiftCode(shiftCode) : null;
          let shiftForCalc = (shiftObj && shiftObj.startTime) 
            ? shiftObj 
            : (normalizedShiftCode ? allShiftsMap?.get(normalizedShiftCode) : null);
          
          // If still no shift found, try employee's current shift object (fallback)
          if (!shiftForCalc && employeeShiftObj && employeeShiftObj.startTime) {
            shiftForCalc = employeeShiftObj;
          }
          
          // If still no shift found, try to get from employee's shift code
          if (!shiftForCalc && emp.shift) {
            const extractedEmpShift = extractShiftCode(emp.shift);
            shiftForCalc = allShiftsMap?.get(extractedEmpShift);
          }
          
          const flags = computeLateEarly(shiftForCalc, checkIn, checkOut, allShiftsMap);
          
          
          late = !!flags.late;
          earlyLeave = !!flags.earlyLeave;

          lateMinutes = flags.lateMinutes || 0;
          earlyMinutes = flags.earlyMinutes || 0;

          dayViolationMinutes = lateMinutes + earlyMinutes;
        } else if (sameTimePunch) {
          // If check-in and check-out are the same time, treat as missing check-out
          // This will be handled by the missing punch logic below
          late = false;
          earlyLeave = false;
          lateMinutes = 0;
          earlyMinutes = 0;
          dayViolationMinutes = 0;
        }

        // Now read excused flags from database (use recalculated late/early for fallback)
        // Support both new separate fields and legacy excused field
        const lateExcused = doc?.lateExcused !== undefined 
          ? !!doc.lateExcused 
          : (doc?.excused && late); // Use recalculated late, not stored doc?.late
        const earlyExcused = doc?.earlyExcused !== undefined 
          ? !!doc.earlyExcused 
          : (doc?.excused && earlyLeave); // Use recalculated earlyLeave, not stored doc?.earlyLeave
        const excused = lateExcused || earlyExcused; // For backward compatibility

        // Check late separately
        if (late && !lateExcused) {
          lateCount++;
          totalLateMinutes += lateMinutes;
        }
        // Check early separately
        if (earlyLeave && !earlyExcused) {
          earlyCount++;
          totalEarlyMinutes += earlyMinutes;
        }

        // Only count violations if it's a working day with punches (not leave/holiday)
        const hasViolationDay = (late && !lateExcused) || (earlyLeave && !earlyExcused);
        const isWorkingDayWithViolation = hasViolationDay && 
          status !== 'Holiday' && 
          status !== 'Paid Leave' && 
          status !== 'Un Paid Leave' && 
          status !== 'Sick Leave' && 
          status !== 'Work From Home' &&
          checkIn && 
          checkOut;

        // =============================================================================
        // SALARY DEDUCTION FORMULA FOR VIOLATION DAYS (LATE/EARLY DEPARTURE)
        // =============================================================================
        //
        // VIOLATION POLICY OVERVIEW:
        // --------------------------
        // Violations are counted sequentially for each working day with late/early punches.
        // Only violations on working days (not holidays/leaves) with actual check-in/out are counted.
        //
        // VIOLATION COUNTING RULES:
        // -------------------------
        // 1st & 2nd violations: FREE (no salary deduction) - grace period
        // 3rd violation:      → 1 FULL DAY deduction
        // 4th violation:      → PER-MINUTE FINE (0.007 day per minute)
        // 5th violation:      → PER-MINUTE FINE (0.007 day per minute)
        // 6th violation:      → 1 FULL DAY deduction (total: 2 full days)
        // 7th violation:      → PER-MINUTE FINE (0.007 day per minute)
        // 8th violation:      → PER-MINUTE FINE (0.007 day per minute)
        // 9th violation:      → 1 FULL DAY deduction (total: 3 full days)
        // 10th violation:     → PER-MINUTE FINE (0.007 day per minute)
        // 11th violation:     → PER-MINUTE FINE (0.007 day per minute)
        // 12th violation:     → 1 FULL DAY deduction (total: 4 full days)
        // ... and so on (pattern repeats every 3 violations)
        //
        // MATHEMATICAL FORMULA:
        // ---------------------
        // Pattern: Every 3rd violation (3, 6, 9, 12, 15, ...) = 1 full day
        //          All other violations after 3rd (4, 5, 7, 8, 10, 11, ...) = per-minute fine
        //
        // Full Day Deductions = floor(violationCount / 3)
        //   Examples:
        //   - 3 violations → floor(3/3) = 1 full day
        //   - 6 violations → floor(6/3) = 2 full days
        //   - 9 violations → floor(9/3) = 3 full days
        //
        // Per-Minute Fine Days = sum of (violationMinutes × 0.007) for each violation
        //   where violation is NOT a multiple of 3 AND > 3
        //   Examples:
        //   - 4th violation: 10 minutes late → 10 × 0.007 = 0.07 days
        //   - 5th violation: 25 minutes late → 25 × 0.007 = 0.175 days
        //   - 7th violation: 30 minutes late → 30 × 0.007 = 0.21 days
        //
        // Total Violation Days = Full Day Deductions + Per-Minute Fine Days
        //
        // EXAMPLE CALCULATIONS:
        // ---------------------
        // Example 1: Employee has 5 violations in a month
        //   Violation #1: 15 min late (FREE - no deduction)
        //   Violation #2: 20 min late (FREE - no deduction)
        //   Violation #3: 10 min late → 1 FULL DAY (3rd violation)
        //   Violation #4: 30 min late → 30 × 0.007 = 0.21 days (per-minute)
        //   Violation #5: 45 min late → 45 × 0.007 = 0.315 days (per-minute)
        //   Total = 1.0 + 0.21 + 0.315 = 1.525 days deduction
        //
        // Example 2: Employee has 8 violations in a month
        //   Violations #1-2: FREE (grace period)
        //   Violation #3: → 1 FULL DAY
        //   Violation #4: 20 min → 0.14 days
        //   Violation #5: 15 min → 0.105 days
        //   Violation #6: → 1 FULL DAY (6th violation, total now 2 full days)
        //   Violation #7: 25 min → 0.175 days
        //   Violation #8: 10 min → 0.07 days
        //   Total = 2.0 + 0.14 + 0.105 + 0.175 + 0.07 = 2.49 days deduction
        //
        // PER-MINUTE FINE DETAILS:
        // ------------------------
        // Rate: 0.007 days per minute (approximately 1 day per 143 minutes)
        // Cap: Maximum 1 day per violation (safety check - if minutes exceed 143)
        // Formula: fineForDay = min(violationMinutes × 0.007, 1.0)
        //
        // WHAT CONSTITUTES A VIOLATION:
        // -----------------------------
        // - Late arrival: Check-in AFTER shift start time + grace period (usually 15 min)
        // - Early departure: Check-out BEFORE shift end time + grace period (usually 15 min)
        // - Only counted if NOT excused (lateExcused/earlyExcused = false)
        // - Only counted on working days with actual punches (not holidays/leaves)
        // - Violation minutes = minutes BEYOND the grace period
        //   Example: Shift starts 9:00, grace 15 min, check-in 9:20
        //            Late minutes = (9:20 - 9:00) - 15 = 20 - 15 = 5 minutes
        //
        // =============================================================================
        if (isWorkingDayWithViolation) {
          // Increment violation counter (1st violation, 2nd violation, 3rd violation, etc.)
          violationDaysCount += 1;
          const vNo = violationDaysCount; // Current violation number

          // DETERMINE DEDUCTION TYPE BASED ON VIOLATION NUMBER:
          // ---------------------------------------------------
          // Use violation rules from database
          const vConfig = violationRules.violationConfig;
          
          // Skip free violations (1st, 2nd, etc.) - no deduction for these
          if (vNo > vConfig.freeViolations) {
            // Pattern check: Is this a "milestone" violation? (3rd, 6th, 9th, 12th, ...)
            // These are multiples of milestoneInterval
            if (vNo % vConfig.milestoneInterval === 0) {
              // ✓ MILESTONE VIOLATION: Add 1 FULL DAY deduction
              violationBaseDays += 1;
              
              // Note: No per-minute fine for milestone violations (full day only)
            } else {
              // ✓ REGULAR VIOLATION: Apply per-minute fine
              // PER-MINUTE FINE CALCULATION:
              // ----------------------------
              // Formula: fineForDay = violationMinutes × perMinuteRate
              // Cap: Maximum maxPerMinuteFine days per violation
              const fineForThisDay = Math.min(
                dayViolationMinutes * vConfig.perMinuteRate,
                vConfig.maxPerMinuteFine
              );
              perMinuteFineDays += fineForThisDay;
              
            }
          }
          // Note: vNo <= freeViolations means violations #1, #2, etc. are FREE (no deduction)
        }

        // ----------------- ABSENT / MISSING PUNCH DEDUCTION -----------------------
        // Use rules from database
        const partialPunch = (checkIn && !checkOut) || (!checkIn && checkOut);
        // bothMissing already defined above
        const excusedForMissing = earlyExcused || lateExcused;
        
        // Determine if this is an absent day (missing punch OR no punch at all)
        // Exclude Leave Without Inform from absent calculation (handled separately)
        const isAbsentDay = (partialPunch || bothMissing) && 
          status !== 'Holiday' && 
          status !== 'Paid Leave' && 
          status !== 'Un Paid Leave' && 
          status !== 'Sick Leave' && 
          status !== 'Work From Home' &&
          status !== 'Leave Without Inform' &&
          !excusedForMissing;
        
        // Apply absent deduction using database rules
        // IMPORTANT: Don't count if it's already a leave (Unpaid Leave, Sick Leave, or Leave Without Inform)
        if (isAbsentDay && !isWeekendOff && status !== 'Un Paid Leave' && status !== 'Sick Leave' && status !== 'Leave Without Inform') {
          const missingPunchDays = getMissingPunchDeductionDays(bothMissing, partialPunch, violationRules.absentConfig);
          absentDays += missingPunchDays;
        }

        // ----------------- LEAVE / HALF-DAY RULES ----------------
        // Use database rules for leave deductions
        const leaveDeduction = getLeaveDeductionDays(status, violationRules.leaveConfig, violationRules.absentConfig);
        
        if (status === 'Un Paid Leave' || status === 'Sick Leave') {
          unpaidLeaveDays += leaveDeduction;
        } else if (status === 'Leave Without Inform') {
          // Leave Without Inform is handled in absentConfig
          absentDays += leaveDeduction;
        } else if (status === 'Half Day') {
          halfDays += leaveDeduction;
        }
        // Paid Leave = no deduction (excluded from all deduction logic)

        days.push({
          date,
          shift: shiftCode, // Use shift code for display
          status,
          reason,
          checkIn: checkIn ? checkIn.toISOString() : null,
          checkOut: checkOut ? checkOut.toISOString() : null,
          late,
          earlyLeave,
          excused: lateExcused || earlyExcused, // For backward compatibility
          lateExcused,
          earlyExcused,
          leaveType: doc?.leaveType || null, // Paid leave type (casual/annual)
          isFuture: false,
        });
      }

      // =============================================================================
      // FINAL SALARY DEDUCTION CALCULATION - COMBINING ALL DEDUCTION COMPONENTS
      // =============================================================================
      //
      // TOTAL SALARY DEDUCTION FORMULA:
      // --------------------------------
      // Salary Deduction (days) = 
      //   Violation Full Days +          // From 3rd, 6th, 9th, ... violations (1 day each)
      //   Violation Per-Minute Days +    // From 4th, 5th, 7th, 8th, ... violations (minutes × 0.007)
      //   Unpaid Leave Days +            // Unpaid Leave + Sick Leave (1 day each)
      //   Absent Days +                  // Missing punches or no attendance (1 day each, LWI = 1.5 days)
      //   Half Days                      // Half-day leaves (0.5 day each)
      //
      // COMPONENT BREAKDOWN:
      // --------------------
      // 1. VIOLATION FULL DAYS (violationBaseDays):
      //    - Accumulated from milestone violations (3rd, 6th, 9th, 12th, ...)
      //    - Each milestone violation = 1 full day
      //    - Example: 9 violations → 3 full days (from violations #3, #6, #9)
      //
      // 2. VIOLATION PER-MINUTE DAYS (perMinuteFineDays):
      //    - Accumulated from non-milestone violations after 3rd (4th, 5th, 7th, 8th, ...)
      //    - Formula per violation: min(violationMinutes × 0.007, 1.0) days
      //    - Example: 4th violation (30 min) + 5th violation (20 min) + 7th violation (15 min)
      //              = (30×0.007) + (20×0.007) + (15×0.007) = 0.21 + 0.14 + 0.105 = 0.455 days
      //
      // 3. UNPAID LEAVE DAYS (unpaidLeaveDays):
      //    - Unpaid Leave status: 1 day per occurrence
      //    - Sick Leave status: 1 day per occurrence (treated as unpaid)
      //    - Example: 3 Unpaid Leave + 2 Sick Leave = 5 days
      //
      // 4. ABSENT DAYS (absentDays):
      //    - Missing both check-in AND check-out: 1 day per occurrence
      //    - Missing only check-in OR only check-out: 1 day per occurrence
      //    - Leave Without Inform (LWI) status: 1.5 days per occurrence
      //    - Example: 2 days missing punches + 1 LWI = 2 + 1.5 = 3.5 days
      //
      // 5. HALF DAYS (halfDays):
      //    - Half Day status: 0.5 day per occurrence
      //    - Example: 3 Half Days = 1.5 days
      //
      // COMPLETE EXAMPLE CALCULATION:
      // -----------------------------
      // Employee with:
      //   - 8 violations (violations #3, #4, #5, #6, #7, #8 with 20, 30, 15, 10, 25, 10 min)
      //   - 2 Unpaid Leave
      //   - 1 Sick Leave
      //   - 3 Absent days (missing punches)
      //   - 1 Leave Without Inform (1.5 days)
      //   - 2 Half Days
      //
      // Calculation:
      //   violationFullDays = 2 (from violations #3 and #6)
      //   perMinuteDays = (20×0.007) + (30×0.007) + (15×0.007) + (25×0.007) + (10×0.007)
      //                = 0.14 + 0.21 + 0.105 + 0.175 + 0.07 = 0.70 days
      //   unpaidLeaveDays = 2 + 1 = 3 days
      //   absentDays = 3 + 1.5 = 4.5 days
      //   halfDays = 2 × 0.5 = 1.0 day
      //
      //   TOTAL = 2.0 + 0.70 + 3.0 + 4.5 + 1.0 = 11.2 days deduction
      //
      // SALARY CALCULATION:
      // -------------------
      // Per-Day Salary = Gross Monthly Salary ÷ 30 days
      // Deduction Amount = Per-Day Salary × Total Deduction Days
      // Net Salary = Gross Salary - Deduction Amount
      //
      // Example (continued from above):
      //   Gross Salary = ₹30,000
      //   Per-Day Salary = ₹30,000 ÷ 30 = ₹1,000
      //   Deduction Amount = ₹1,000 × 11.2 = ₹11,200
      //   Net Salary = ₹30,000 - ₹11,200 = ₹18,800
      //
      // =============================================================================

      // Component 1: Violation Full Days (from milestone violations: 3rd, 6th, 9th, ...)
      const violationFullDays = violationBaseDays;

      // Component 2: Violation Per-Minute Days (from non-milestone violations: 4th, 5th, 7th, 8th, ...)
      const perMinuteDays = perMinuteFineDays;

      // Component 3: Other Deductions
      // - unpaidLeaveDays: Unpaid Leave + Sick Leave (1 day each)
      // - absentDays: Missing punches (1 day each) + Leave Without Inform (1.5 days each)
      // - halfDays: Half Day leaves (0.5 day each)
      // Note: Missing punch is counted as absent (1 day), not a separate category
      const salaryDeductDaysRaw =
        violationFullDays +      // Full days from milestone violations
        perMinuteDays +          // Days from per-minute violation fines
        unpaidLeaveDays +        // Unpaid Leave + Sick Leave
        absentDays +             // Missing punches + Leave Without Inform
        halfDays;                // Half-day leaves

      // Calculate final deduction (rounded to 3 decimal places for precision)
      // No artificial cap applied - if deduction exceeds month days, it reflects actual violations/absences
      // Example: If deduction = 35 days in a 30-day month, employee will have negative/zero net salary
      const salaryDeductDays = Number(salaryDeductDaysRaw.toFixed(3));


      const grossSalary = emp.monthlySalary || 0;
      // Use actual days in the month for salary calculation (more accurate than fixed 30 days)
      // This handles months with 28, 29, 30, or 31 days correctly
      const actualDaysInMonth = daysInMonth; // Already calculated from the month
      const salaryCalc = calculateSalaryAmounts(
        grossSalary, 
        salaryDeductDays, 
        { daysPerMonth: actualDaysInMonth } // Use actual month days instead of rule's default
      );
      const perDaySalary = salaryCalc.perDaySalary;
      const salaryDeductAmount = salaryCalc.deductionAmount;
      const netSalary = salaryCalc.netSalary;

      // Get dynamic shift for the employee - use current shift assignment (no history)
      let dynamicShift = emp.shift || '';
      if (useDynamicShifts) {
        // Use employee's current shift object (from shiftId field)
        if (employeeShiftObj && employeeShiftObj.code) {
          dynamicShift = employeeShiftObj.code;
        } else if (emp.shiftId) {
          // Try to get shift from employee's shiftId if shift object wasn't found
          const shiftFromId = allShiftsMap.get(emp.shiftId.toString());
          if (shiftFromId && shiftFromId.code) {
            dynamicShift = shiftFromId.code;
          }
        } else if (emp.shift) {
          // Last fallback: try to extract shift code from emp.shift (might be formatted string)
          const extractedCode = extractShiftCode(emp.shift);
          // Try to look it up in allShiftsMap to verify it's valid
          const shiftFromCode = allShiftsMap.get(extractedCode);
          if (shiftFromCode && shiftFromCode.code) {
            dynamicShift = shiftFromCode.code;
          } else {
            // Use extracted code even if not found in map (might be a valid code not in active shifts)
            dynamicShift = extractedCode;
          }
        }
      }

      employeesOut.push({
        empCode: emp.empCode,
        name: emp.name || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: dynamicShift,
        monthlySalary: grossSalary, // GROSS
        netSalary: Number(netSalary.toFixed(2)), // NET after deduction
        salaryDeductAmount: Number(salaryDeductAmount.toFixed(2)),
        lateCount,
        earlyCount,
        violationDays: violationDaysCount,
        missingPunchDays,
        unpaidLeaveDays,
        absentDays,
        halfDays,
        salaryDeductDays,
        totalLateMinutes,
        totalEarlyMinutes,
        days,
      });
    }

    // Stable Multi-Criteria Sort (Optimized)
    // Algorithm: JavaScript's native sort (Timsort-like, stable O(n log n))
    // Sort criteria: 1) Department (alphabetical), 2) Employee Code (numeric-aware)
    employeesOut.sort((a, b) => {
      // Primary sort: Department (case-insensitive)
      const da = (a.department || '').toLowerCase().trim();
      const db = (b.department || '').toLowerCase().trim();
      if (da !== db) {
        return da.localeCompare(db, undefined, { sensitivity: 'base' });
      }
      
      // Secondary sort: Employee Code (numeric-aware for better ordering)
      const codeA = String(a.empCode || '').trim();
      const codeB = String(b.empCode || '').trim();
      
      // Try numeric comparison first (if both are numeric)
      const numA = Number(codeA);
      const numB = Number(codeB);
      if (!isNaN(numA) && !isNaN(numB) && codeA === String(numA) && codeB === String(numB)) {
        return numA - numB; // Numeric sort
      }
      
      // Fallback to string comparison with natural ordering
      return codeA.localeCompare(codeB, undefined, { 
        numeric: true, // Natural sort: "2" comes before "10"
        sensitivity: 'base' 
      });
    });

    // Return data directly - no caching
    const result = {
      month: monthPrefix,
      daysInMonth,
      employees: employeesOut,
    };

    // Direct response - no caching
    // OPTIMIZATION: Add cache headers for monthly attendance (30s for past months)
    const response = successResponse(
      result,
      'Monthly attendance retrieved successfully',
      HTTP_STATUS.OK
    );
    
    // Cache past months for 30 seconds (data doesn't change)
    if (monthRelation === -1) {
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    }
    
    return response;
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// -----------------------------------------------------------------------------
// PAID LEAVE COUNTER HELPERS (defensive: counters never go below zero)
// -----------------------------------------------------------------------------

/**
 * Increment paid leave taken for the given type. Only increments if there is
 * remaining balance (same business rule as before).
 * @param {import('mongoose').Document} paidLeaveDoc - PaidLeave document (mutated)
 * @param {string} leaveType - 'casual' or 'annual'
 */
function incrementPaidLeaveTaken(paidLeaveDoc, leaveType) {
  if (leaveType === 'casual' && (paidLeaveDoc.casualLeavesAllocated || 0) - (paidLeaveDoc.casualLeavesTaken || 0) > 0) {
    paidLeaveDoc.casualLeavesTaken = (paidLeaveDoc.casualLeavesTaken || 0) + 1;
  } else if (leaveType === 'annual' && (paidLeaveDoc.annualLeavesAllocated || 0) - (paidLeaveDoc.annualLeavesTaken || 0) > 0) {
    paidLeaveDoc.annualLeavesTaken = (paidLeaveDoc.annualLeavesTaken || 0) + 1;
  }
}

/**
 * Decrement paid leave taken for the given type. Never goes below zero.
 * @param {import('mongoose').Document} paidLeaveDoc - PaidLeave document (mutated)
 * @param {string} leaveType - 'casual' or 'annual'
 */
function decrementPaidLeaveTaken(paidLeaveDoc, leaveType) {
  if (leaveType === 'casual') {
    paidLeaveDoc.casualLeavesTaken = Math.max(0, (paidLeaveDoc.casualLeavesTaken || 0) - 1);
  } else if (leaveType === 'annual') {
    paidLeaveDoc.annualLeavesTaken = Math.max(0, (paidLeaveDoc.annualLeavesTaken || 0) - 1);
  }
}

// -----------------------------------------------------------------------------
// POST /api/hr/monthly-attendance
// -----------------------------------------------------------------------------

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      empCode,
      date,
      status,
      reason,
      checkInTime,
      checkOutTime,
      violationExcused, // Legacy: kept for backward compatibility
      lateExcused,
      earlyExcused,
      leaveType, // casual or annual (only when status is Paid Leave)
    } = body;

    if (!empCode || !date) {
      throw new ValidationError('empCode and date are required');
    }

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';

    // OPTIMIZATION: Run queries in parallel for faster response
    const [allShifts, emp, departmentDocs] = await Promise.all([
      Shift.find({ isActive: true })
        .select('_id name code startTime endTime crossesMidnight gracePeriod')
        .lean()
        .maxTimeMS(1500),
      Employee.findOne({ empCode })
        .select('empCode name shift shiftId department designation monthlySalary saturdayGroup')
        .lean()
        .maxTimeMS(2000),
      Department.find().select('name saturdayPolicy').lean().maxTimeMS(1500),
    ]);
    
    const allShiftsMap = new Map();
    allShifts.forEach((s) => {
      allShiftsMap.set(s._id.toString(), s);
      allShiftsMap.set(s.code, s);
    });
    const departmentPolicyMap = new Map();
    (departmentDocs || []).forEach((d) => {
      if (d.name != null) departmentPolicyMap.set(String(d.name).trim(), d.saturdayPolicy || 'alternate');
    });
    if (!emp) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    // Get shift for this date - use employee's current shift (no history)
    let shiftObj = null;
    let shiftCode = '';
    
    // Use employee's shiftId or shift code (allShiftsMap already loaded above)
    if (emp.shiftId) {
      shiftObj = allShiftsMap.get(emp.shiftId.toString());
      if (shiftObj) {
        shiftCode = shiftObj.code;
      }
    }
    
    if (!shiftObj && emp.shift) {
      const extractedCode = extractShiftCode(emp.shift);
      shiftObj = allShiftsMap.get(extractedCode);
      if (shiftObj) {
        shiftCode = shiftObj.code;
      } else {
        shiftCode = extractedCode;
      }
    }
    
    if (!shiftCode) {
      shiftCode = emp.shift || '';
    }

    let checkIn = null;
    let checkOut = null;

    // store with explicit offset (+05:00) – absolute time is correct everywhere
    if (checkInTime) {
      checkIn = new Date(`${date}T${checkInTime}:00${TZ}`);
    }

    if (checkOutTime) {
      let coDate = date;
      // Check if shift crosses midnight (from shift object or legacy codes)
      const crossesMidnight = shiftObj
        ? shiftObj.crossesMidnight
        : (shiftObj?.crossesMidnight || false);
      
      if (crossesMidnight) {
        const [hStr] = checkOutTime.split(':');
        const h = Number(hStr || '0');
        if (h < 8) {
          // next-day checkout – move company date +1 safely using UTC fields
          const base = new Date(`${date}T00:00:00${TZ}`);
          base.setUTCDate(base.getUTCDate() + 1);
          coDate = toYMD(base); // uses UTC fields
        }
      }
      checkOut = new Date(`${coDate}T${checkOutTime}:00${TZ}`);
    }

    // We still store only flags here; minute-level salary handling happens in GET
    let late = false;
    let earlyLeave = false;
    if (checkIn && checkOut) {
      // Normalize shiftCode in case it's a formatted string
      const normalizedShiftCode = shiftCode ? extractShiftCode(shiftCode) : null;
      const shiftForCalc = shiftObj || (normalizedShiftCode ? allShiftsMap?.get(normalizedShiftCode) : null);
      const flags = computeLateEarly(shiftForCalc, checkIn, checkOut, allShiftsMap);
      late = flags.late;
      earlyLeave = flags.earlyLeave;
    }

    // Handle excused flags - support both new separate fields and legacy
    // IMPORTANT: Always use the provided excused flags if they exist, regardless of recalculated late/early
    // This allows users to excuse violations even if times are recalculated
    const finalLateExcused = lateExcused !== undefined 
      ? !!lateExcused 
      : (violationExcused !== undefined ? (violationExcused && late) : false);
    const finalEarlyExcused = earlyExcused !== undefined 
      ? !!earlyExcused 
      : (violationExcused !== undefined ? (violationExcused && earlyLeave) : false);
    const finalExcused = finalLateExcused || finalEarlyExcused; // Legacy field

    // Saving excused flags

    const hasPunch = !!checkIn || !!checkOut;

    // Determine if this date is a weekend (same logic as GET endpoint)
    const dateObj = new Date(`${date}T00:00:00${TZ}`);
    const localMs = dateObj.getTime() + COMPANY_OFFSET_MS;
    const local = new Date(localMs);
    const dow = local.getUTCDay(); // Day of week in company timezone
    const [yearStr, monthStr, ddStr] = date.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const dayOfMonth = parseInt(ddStr, 10);
    const firstParts = getCompanyLocalDateParts(year, monthIndex, 1);
    const saturdayIndex = getSaturdayIndexInMonth(year, monthIndex, dayOfMonth, dow, firstParts.dow);
    
    let isWeekendOff = false;
    if (dow === 0) {
      isWeekendOff = true; // Sunday
    } else if (dow === 6) {
      isWeekendOff = saturdayIndex == null ? true : isSaturdayOffForEmployee(saturdayIndex, emp, departmentPolicyMap, emp.department || '');
    }

    let rawStatus = status;
    let attendanceStatus;

    if (!rawStatus) {
      if (hasPunch) {
        rawStatus = 'Present';
      } else {
        rawStatus = 'Absent';
      }
    }

    attendanceStatus = normalizeStatus(rawStatus, { isWeekendOff });

    const totalPunches = checkIn && checkOut ? 2 : hasPunch ? 1 : 0;

    const update = {
      date,
      empCode,
      employeeName: emp.name || '',
      department: emp.department || '',
      designation: emp.designation || '',
      shift: shiftCode,
      checkIn,
      checkOut,
      totalPunches,
      attendanceStatus,
      reason: reason || '',
      late,
      earlyLeave,
      excused: finalExcused, // Legacy field for backward compatibility
      lateExcused: finalLateExcused,
      earlyExcused: finalEarlyExcused,
      // Add leaveType if status is Paid Leave
      ...(attendanceStatus === 'Paid Leave' && leaveType && { leaveType }),
      updatedAt: new Date(),
    };

    // Check current status in database to detect changes (read before transaction)
    const existingRecord = await ShiftAttendance.findOne({ empCode, date })
      .select('attendanceStatus leaveType')
      .lean()
      .maxTimeMS(2000);

    const wasPaidLeave = existingRecord?.attendanceStatus === 'Paid Leave';
    const isPaidLeave = attendanceStatus === 'Paid Leave';

    // Only fetch leave record when status is or was Paid Leave (fewer queries)
    const existingLeave = (wasPaidLeave || isPaidLeave)
      ? await LeaveRecord.findOne({ empCode, date }).lean().maxTimeMS(2000)
      : null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // -------------------------------------------------------------------------
        // STATE TRANSITION: Normal → Paid Leave (new paid leave for this date)
        // -------------------------------------------------------------------------
        if (isPaidLeave && leaveType) {
          const year = parseInt(date.split('-')[0], 10);
          const paidLeave = await PaidLeave.getOrCreate(empCode, year, session);

          if (!existingLeave) {
            await LeaveRecord.findOneAndUpdate(
              { empCode, date },
              {
                empCode,
                date,
                leaveType,
                reason: reason || '',
                markedBy: 'HR',
              },
              { upsert: true, new: true, session }
            );
            incrementPaidLeaveTaken(paidLeave, leaveType);
            await paidLeave.save({ session });
          } else if (existingLeave.leaveType !== leaveType) {
            // -------------------------------------------------------------------------
            // STATE TRANSITION: Paid Leave type change (casual ↔ annual)
            // -------------------------------------------------------------------------
            const oldLeaveType = existingLeave.leaveType;
            decrementPaidLeaveTaken(paidLeave, oldLeaveType);
            incrementPaidLeaveTaken(paidLeave, leaveType);
            await LeaveRecord.findOneAndUpdate(
              { empCode, date },
              { leaveType, reason: reason || existingLeave.reason || '' },
              { session }
            );
            await paidLeave.save({ session });
          }
        } else if (wasPaidLeave && !isPaidLeave) {
          // -------------------------------------------------------------------------
          // STATE TRANSITION: Paid Leave → Normal (revert to present/absent/etc.)
          // -------------------------------------------------------------------------
          if (existingLeave) {
            const year = parseInt(date.split('-')[0], 10);
            const paidLeave = await PaidLeave.findOne({ empCode, year }).session(session);
            if (paidLeave) {
              decrementPaidLeaveTaken(paidLeave, existingLeave.leaveType);
              await paidLeave.save({ session });
            }
            await LeaveRecord.findOneAndDelete({ empCode, date }, { session });
          }
          delete update.leaveType;
        } else if (wasPaidLeave && isPaidLeave && !leaveType) {
          // Still Paid Leave but leaveType not provided – keep or default
          if (existingLeave) {
            update.leaveType = existingLeave.leaveType;
          } else {
            const year = parseInt(date.split('-')[0], 10);
            const paidLeave = await PaidLeave.getOrCreate(empCode, year, session);
            const defaultLeaveType = (paidLeave.casualLeavesAllocated || 0) - (paidLeave.casualLeavesTaken || 0) > 0 ? 'casual' : 'annual';
            update.leaveType = defaultLeaveType;
            await LeaveRecord.findOneAndUpdate(
              { empCode, date },
              {
                empCode,
                date,
                leaveType: defaultLeaveType,
                reason: reason || '',
                markedBy: 'HR',
              },
              { upsert: true, new: true, session }
            );
            incrementPaidLeaveTaken(paidLeave, defaultLeaveType);
            await paidLeave.save({ session });
          }
        }

        // ShiftAttendance update (same upsert, with session)
        await ShiftAttendance.findOneAndUpdate(
          { date, empCode },
          { $set: update },
          { upsert: true, runValidators: true, session }
        ).maxTimeMS(3000);
      });
    } finally {
      await session.endSession();
    }

    return successResponse(
      null,
      'Attendance saved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
