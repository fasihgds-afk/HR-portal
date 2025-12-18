// app/api/hr/monthly-attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Shift from '../../../../models/Shift';
import EmployeeShiftHistory from '../../../../models/EmployeeShiftHistory';

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
function getCompanyLocalDateParts(year, monthIndex, day) {
  // build 00:00 UTC, then shift to company local and read UTC* fields
  const baseUtc = Date.UTC(year, monthIndex, day, 0, 0, 0);
  const local = new Date(baseUtc + COMPANY_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
    dow: local.getUTCDay(), // 0–6 in company timezone
  };
}

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

// Helper: Get shift for employee on a specific date (considering history)
// employeeObj is optional - if provided, avoids extra DB query
async function getShiftForDate(empCode, date, employeeObj = null) {
  try {
    // Try to find shift from history first
    const history = await EmployeeShiftHistory.findOne({
      empCode,
      effectiveDate: { $lte: date },
      $or: [{ endDate: null }, { endDate: { $gte: date } }],
    })
      .sort({ effectiveDate: -1 })
      .lean();

    if (history && history.shiftId) {
      const shift = await Shift.findById(history.shiftId).lean();
      if (shift) return shift;
    }

    // Fallback to employee's current shift
    const employee = employeeObj || await Employee.findOne({ empCode }).lean();
    if (!employee) return null;

    if (employee.shiftId) {
      const shift = await Shift.findById(employee.shiftId).lean();
      if (shift) return shift;
    }

    // Legacy: use shift code
    if (employee.shift) {
      const shift = await Shift.findOne({ code: employee.shift, isActive: true }).lean();
      if (shift) return shift;
    }

    return null;
  } catch (err) {
    console.error(`Error getting shift for ${empCode} on ${date}:`, err);
    return null; // Return null on error, will fallback to legacy shift code
  }
}

// Returns:
//  - late / earlyLeave flags (true/false)
//  - lateMinutes / earlyMinutes = minutes BEYOND grace period
// shift can be either a shift object (from DB) or a shift code string (legacy)
function computeLateEarly(shift, checkIn, checkOut) {
  if (!shift || !checkIn || !checkOut) {
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // convert both punches into company-local minutes
  let inMin = toCompanyMinutes(checkIn);
  let outMin = toCompanyMinutes(checkOut);

  let startMin = 0;
  let endMin = 0;
  let gracePeriod = 15; // default
  let crossesMidnight = false;

  // If shift is an object (from database), use its properties
  if (typeof shift === 'object' && shift.startTime) {
    // Check if it's Saturday for S2 shift (Saturday S2: 18:00-03:00, same as S1)
    const isSaturday = shift.code === 'S2' ? isCompanySaturday(checkIn) : false;
    
    if (shift.code === 'S2' && isSaturday) {
      // Saturday S2: 18:00-03:00 (same as S1)
      startMin = toMinutes(18, 0);
      rawEndMin = toMinutes(3, 0); // 03:00
      crossesMidnight = true;
      gracePeriod = shift.gracePeriod || 15;
    } else {
      // Use shift times from database
      startMin = parseTimeToMinutes(shift.startTime);
      rawEndMin = parseTimeToMinutes(shift.endTime);
      gracePeriod = shift.gracePeriod || 15;
      crossesMidnight = shift.crossesMidnight || false;
    }
    
    // For midnight-crossing shifts, normalize end time
    // Example: "06:00" (360 min) should become 30:00 (1800 min) for calculation
    // Example: "03:00" (180 min) should become 27:00 (1620 min) for calculation
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
    // Legacy: shift is a code string (D1, D2, etc.)
    const isSaturday = isCompanySaturday(checkIn);
    switch (shift) {
      case 'D1':
        startMin = toMinutes(9, 0);
        endMin = toMinutes(18, 0);
        break;
      case 'D2':
        startMin = toMinutes(15, 0);
        endMin = toMinutes(24, 0);
        crossesMidnight = false; // Same day
        break;
      case 'D3':
        startMin = toMinutes(12, 0);
        endMin = toMinutes(21, 0);
        break;
      case 'S1':
        startMin = toMinutes(18, 0);
        endMin = toMinutes(27, 0); // 03:00 next day
        crossesMidnight = true;
        break;
      case 'S2':
        if (isSaturday) {
          startMin = toMinutes(18, 0);
          endMin = toMinutes(27, 0);
          crossesMidnight = true;
        } else {
          startMin = toMinutes(21, 0);
          endMin = toMinutes(30, 0); // 06:00 next day
          crossesMidnight = true;
        }
        break;
      default:
        startMin = toMinutes(9, 0);
        endMin = toMinutes(18, 0);
    }
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
    
    // Normalize check-in:
    // - If it's early morning (00:00-05:59), it's the next day → normalize
    // - If it's before shift start but after 06:00 (e.g., 20:00 for S2), it's early arrival on same day → don't normalize (on-time)
    // Example: S2 starts at 21:00 (1260), punch at 00:04 (4) → belongs to previous day's shift → normalize
    // Example: S2 starts at 21:00 (1260), punch at 20:00 (1200) → early arrival same day → don't normalize (on-time)
    if (inMin < startClock && inMin < earlyMorningThreshold) {
      // Early morning (00:00-05:59) = next day, normalize
      inMin += 24 * 60;
    }
    // If inMin >= earlyMorningThreshold but < startClock, it's early arrival (on-time), don't normalize
    
    // Normalize check-out: same logic
    // Example: S2 ends at 06:00 (360), but we store it as 30:00 (1800) for calculation
    // If check-out is early morning (00:00-05:59), it's the next day
    if (outMin < startClock && outMin < earlyMorningThreshold) {
      outMin += 24 * 60;
    }
    
    // Also normalize endMin if needed (endMin is already stored as next day time like 27:00 or 30:00)
    // For S1: endMin = 27:00 (03:00 next day) = 1620 minutes
    // For S2: endMin = 30:00 (06:00 next day) = 1800 minutes
    // These are already normalized, so we just need to ensure outMin is normalized too
  }

  // Calculate late: how many minutes after shift start
  // IMPORTANT FOR ALL SHIFTS:
  // - If check-in is BEFORE shift start time → on-time (early arrival is fine, not late)
  // - If check-in is AT or AFTER shift start time → calculate if late (after grace period)
  // Example: Shift starts at 9:00, check-in at 8:00 → lateMinutesTotal = -60 → becomes 0 → on-time (green)
  let lateMinutesTotal = inMin - startMin;
  if (lateMinutesTotal < 0) lateMinutesTotal = 0; // Early arrival = on-time (not late)

  // Calculate early: how many minutes before shift end
  // For night shifts, endMin is already normalized (27:00 or 30:00)
  // IMPORTANT FOR ALL SHIFTS:
  // - If check-out is BEFORE shift end time → on-time (not early departure)
  // - If check-out is AT or AFTER shift end time → on-time (stayed late, which is fine)
  // Example: Shift ends at 18:00, check-out at 19:00 → on-time (green)
  // So early departure should never be counted - all check-outs are on-time
  let earlyMinutesTotal = 0;
  // No early departure violations - all check-outs are considered on-time

  const late = lateMinutesTotal > gracePeriod;
  const earlyLeave = earlyMinutesTotal > gracePeriod;

  // Violation minutes = minutes AFTER grace
  const lateMinutes = late ? lateMinutesTotal - gracePeriod : 0;
  const earlyMinutes = earlyLeave ? earlyMinutesTotal - gracePeriod : 0;

  return { late, earlyLeave, lateMinutes, earlyMinutes };
}

// YYYY-MM-DD from a Date, using UTC fields so server timezone doesn’t matter
function toYMD(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${m}-${d}`;
}

// -----------------------------------------------------------------------------
// STATUS NORMALISATION
// -----------------------------------------------------------------------------

function normalizeStatus(rawStatus, { isWeekendOff } = {}) {
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
      return NextResponse.json(
        { error: 'Invalid "month" format. Use YYYY-MM.' },
        { status: 400 }
      );
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

    await connectDB();

    // Check if Shift collection has any documents (to avoid unnecessary queries)
    const shiftCount = await Shift.countDocuments({ isActive: true });
    const useDynamicShifts = shiftCount > 0;

    const employees = await Employee.find(
      {},
      {
        empCode: 1,
        name: 1,
        department: 1,
        designation: 1,
        shift: 1,
        shiftId: 1,
        monthlySalary: 1,
        _id: 0,
      }
    ).lean();

    const monthStartDate = `${monthPrefix}-01`;
    const monthEndDate = `${monthPrefix}-31`;

    const shiftDocs = await ShiftAttendance.find(
      {
        date: { $gte: monthStartDate, $lte: monthEndDate },
      },
      {
        date: 1,
        empCode: 1,
        checkIn: 1,
        checkOut: 1,
        shift: 1,
        attendanceStatus: 1,
        reason: 1,
        excused: 1,
        lateExcused: 1,
        earlyExcused: 1,
        _id: 0,
      }
    ).lean();

    const docsByEmpDate = new Map();
    for (const doc of shiftDocs) {
      if (!doc.empCode || !doc.date) continue;
      docsByEmpDate.set(`${doc.empCode}|${doc.date}`, doc);
    }

    // PERFORMANCE OPTIMIZATION: Pre-fetch all shifts and shift history at once
    const allShiftsMap = new Map();
    if (useDynamicShifts) {
      const allShifts = await Shift.find({ isActive: true }).lean();
      allShifts.forEach((s) => {
        allShiftsMap.set(s._id.toString(), s);
        allShiftsMap.set(s.code, s); // Also index by code for quick lookup
      });
    }

    // Pre-fetch all shift history for all employees in this month (OPTIMIZATION: single query)
    const allShiftHistory = useDynamicShifts && employees.length > 0
      ? await EmployeeShiftHistory.find({
          empCode: { $in: employees.map((e) => e.empCode) },
          effectiveDate: { $lte: monthEndDate },
          $or: [{ endDate: null }, { endDate: { $gte: monthStartDate } }],
        })
          .populate('shiftId')
          .lean()
      : [];

    // Build a map: empCode -> array of history records (sorted by effectiveDate desc)
    const shiftHistoryMap = new Map();
    for (const history of allShiftHistory) {
      if (!shiftHistoryMap.has(history.empCode)) {
        shiftHistoryMap.set(history.empCode, []);
      }
      shiftHistoryMap.get(history.empCode).push(history);
    }
    
    // Sort each employee's history by effectiveDate (descending) for efficient lookup
    for (const [empCode, histories] of shiftHistoryMap.entries()) {
      histories.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
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
        } else if (emp.shift) {
          employeeShiftObj = allShiftsMap.get(emp.shift);
        }
      }

      // Get employee's shift history (pre-fetched array, sorted by effectiveDate desc)
      const empShiftHistoryArray = shiftHistoryMap.get(emp.empCode) || [];

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

        // day-of-week in COMPANY timezone
        const { dow } = getCompanyLocalDateParts(year, monthIndex, day);

        let isWeekendOff = false;
        if (dow === 0) isWeekendOff = true; // Sunday
        if (dow === 6) {
          // alternate Saturdays off
          saturdayIndex++;
          if (saturdayIndex % 2 === 1) isWeekendOff = true;
        }

        // Get shift for this specific date (considering shift history) - OPTIMIZED (no DB queries in loop)
        let shiftObj = shiftCache.get(date);
        let shiftCode = '';
        
        if (useDynamicShifts) {
          if (!shiftObj) {
            // Check pre-fetched shift history first (no DB query)
            // History is sorted by effectiveDate desc, so first match is the most recent
            let historyForDate = null;
            for (const history of empShiftHistoryArray) {
              if (history.effectiveDate <= date) {
                const endDate = history.endDate;
                if (!endDate || endDate >= date) {
                  // This history record applies to this date (first match is most recent)
                  historyForDate = history;
                  break; // Found the most recent applicable history
                }
              }
            }

            if (historyForDate && historyForDate.shiftId) {
              // Use shift from history (already populated, no DB query)
              shiftObj = historyForDate.shiftId; // populate('shiftId') returns the shift object here
              if (shiftObj && shiftObj.code) {
                shiftCode = shiftObj.code;
                shiftCache.set(date, shiftObj);
              } else {
                // Fallback to shiftCode stored in history
                shiftObj = allShiftsMap.get(historyForDate.shiftCode);
                if (shiftObj) {
                  shiftCode = shiftObj.code;
                  shiftCache.set(date, shiftObj);
                } else {
                  shiftCode = historyForDate.shiftCode;
                }
              }
            } else if (doc?.shift) {
              // Fallback: Use shift from attendance record (from pre-fetched map, no DB query)
              shiftObj = allShiftsMap.get(doc.shift);
              if (shiftObj) {
                shiftCode = shiftObj.code;
                shiftCache.set(date, shiftObj);
              } else {
                shiftCode = doc.shift; // Use code directly if shift not found
              }
            } else if (employeeShiftObj) {
              // Fallback: Use employee's current shift (pre-fetched, no DB query)
              shiftObj = employeeShiftObj;
              shiftCode = employeeShiftObj.code;
              shiftCache.set(date, shiftObj);
            } else {
              shiftCode = empShift || 'D1';
            }
          } else {
            shiftCode = shiftObj.code;
          }
        } else {
          // No dynamic shifts in DB, use shift from attendance record or employee's current shift
          shiftCode = doc?.shift || empShift || 'D1';
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
            isFuture: true,
          });
          continue;
        }

        const checkIn = doc?.checkIn ? new Date(doc.checkIn) : null;
        const checkOut = doc?.checkOut ? new Date(doc.checkOut) : null;
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
          const shiftForCalc = shiftObj || shiftCode;
          const flags = computeLateEarly(shiftForCalc, checkIn, checkOut);
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

        // ---------------- SALARY RULES FOR VIOLATION DAYS -----------------
        // Policy:
        // - 3rd violation → 1 full day (total: 1 day)
        // - 4th, 5th violation → per-minute fine (0.007 day per minute)
        // - 6th violation → 2 full days TOTAL (adds 1 more day, total: 2 days)
        // - 7th, 8th violation → per-minute fine (0.007 day per minute)
        // - 9th violation → 3 full days TOTAL (adds 1 more day, total: 3 days)
        // - 10th, 11th violation → per-minute fine (0.007 day per minute)
        // - And so on...
        // IMPORTANT: Only count violations on working days with actual punches
        if (isWorkingDayWithViolation) {
          violationDaysCount += 1;
          const vNo = violationDaysCount;

          // Check if this is a "3rd violation" (3rd, 6th, 9th, 12th, ...)
          // Each 3rd violation adds 1 full day to the total
          if (vNo % 3 === 0) {
            // Add 1 full day for this 3rd violation
            // 3rd violation → total becomes 1 day
            // 6th violation → total becomes 2 days (adds 1 more)
            // 9th violation → total becomes 3 days (adds 1 more)
            violationBaseDays += 1;
            // 3rd, 6th, 9th, ... → full days only (no per-minute)
          } else if (vNo > 3) {
            // 4th, 5th, 7th, 8th, 10th, 11th, 13th, 14th, ...
            // per-minute fine based on that day's violation minutes
            // each minute → 0.007 day
            // Cap per-day fine at 1 day maximum (safety check - 143 minutes = 1 day)
            const fineForThisDay = Math.min(dayViolationMinutes * 0.007, 1.0);
            perMinuteFineDays += fineForThisDay;
            
            // Debug logging for suspiciously high per-minute fines
            if (fineForThisDay >= 1.0 || dayViolationMinutes > 200) {
              console.log(`[DEBUG] High per-minute fine for ${emp.empCode} on ${date}:`, {
                empCode: emp.empCode,
                date,
                violationDay: vNo,
                dayViolationMinutes,
                fineForThisDay,
                late,
                earlyLeave,
                lateMinutes,
                earlyMinutes,
              });
            }
          }
        }

        // ----------------- ABSENT / MISSING PUNCH DEDUCTION -----------------------
        // According to new policy:
        // - Missing BOTH check-in AND check-out = 1 day salary deduction
        // - Missing ONLY check-in OR ONLY check-out = 1.5 days salary deduction
        // - Leave Without Inform status = 1.5 days salary deduction
        // - Paid Leave = NO salary deduction
        // - Unpaid Leave = 1 full day salary deduction
        // - Sick Leave = 1 full day salary deduction (treated as unpaid)
        
        const partialPunch = (checkIn && !checkOut) || (!checkIn && checkOut);
        // bothMissing already defined above (line 599)
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
        
        // Apply absent deduction (only once, not double counted)
        // IMPORTANT: Don't count if it's already a leave (Unpaid Leave, Sick Leave, or Leave Without Inform)
        if (isAbsentDay && !isWeekendOff && status !== 'Un Paid Leave' && status !== 'Sick Leave' && status !== 'Leave Without Inform') {
          if (bothMissing) {
            // Both check-in and check-out missing = 1 day deduction
            absentDays += 1;
          } else if (partialPunch) {
            // Only one punch missing = 1 day deduction (not 1.5)
            absentDays += 1;
          }
        }

        // ----------------- LEAVE / HALF-DAY RULES ----------------
        // Unpaid Leave and Sick Leave both deduct 1 full day salary
        if (status === 'Un Paid Leave') {
          unpaidLeaveDays += 1; // 1 full day deduction
        } else if (status === 'Sick Leave') {
          // Sick leave is treated as unpaid (1 day deduction) per policy
          unpaidLeaveDays += 1;
        } else if (status === 'Leave Without Inform') {
          // Leave Without Inform = 1.5 days salary deduction
          absentDays += 1.5;
        }
        // Paid Leave = no deduction (excluded from all deduction logic)

        if (status === 'Half Day') {
          halfDays += 0.5;
        }

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
          isFuture: false,
        });
      }

      // -------------------- FINAL SALARY DEDUCTION ----------------------
      // Base from violations (3rd, 6th, 9th, ...)
      const violationFullDays = violationBaseDays;

      // Per-minute violation days for 4th,5th,7th,8th,...
      const perMinuteDays = perMinuteFineDays;

      // Other deductions
      // Note: Missing punch is now counted as absent (1.5 days), not separate
      const salaryDeductDaysRaw =
        violationFullDays +
        perMinuteDays +
        unpaidLeaveDays +
        absentDays +
        halfDays;

      // Calculate final deduction (no artificial cap - let calculation be accurate)
      // If deduction exceeds month days, it means employee had many violations/absences
      const salaryDeductDays = Number(salaryDeductDaysRaw.toFixed(3));

      // Debug logging for high deductions (more than 20 days seems suspicious)
      if (salaryDeductDays > 20) {
        console.log(`[DEBUG] High deduction for ${emp.empCode} (${emp.name || 'Unknown'}):`, {
          empCode: emp.empCode,
          name: emp.name,
          violationFullDays,
          perMinuteDays: Number(perMinuteDays.toFixed(3)),
          missingPunchDays,
          unpaidLeaveDays,
          absentDays,
          halfDays,
          violationDaysCount,
          lateCount,
          earlyCount,
          totalLateMinutes,
          totalEarlyMinutes,
          totalSalaryDeductDays: salaryDeductDays,
          breakdown: {
            violationFullDays,
            perMinuteDays: Number(perMinuteDays.toFixed(3)),
            missingPunchDays,
            unpaidLeaveDays,
            absentDays,
            halfDays,
            sum: Number(salaryDeductDaysRaw.toFixed(3)),
          },
        });
      }

      const grossSalary = emp.monthlySalary || 0;
      // You can change divisor (30) to 26 or 31 if company policy is different
      const perDaySalary = grossSalary > 0 ? grossSalary / 30 : 0;
      const salaryDeductAmount = perDaySalary * salaryDeductDays;
      const netSalary = grossSalary - salaryDeductAmount;

      employeesOut.push({
        empCode: emp.empCode,
        name: emp.name || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: emp.shift || '',
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

    employeesOut.sort((a, b) => {
      const da = a.department || '';
      const db = b.department || '';
      if (da !== db) return da.localeCompare(db);
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    // Add cache headers for better performance (1 minute cache for monthly data)
    return NextResponse.json({
      month: monthPrefix,
      daysInMonth,
      employees: employeesOut,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('GET /api/hr/monthly-attendance error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
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
    } = body;

    if (!empCode || !date) {
      return NextResponse.json(
        { error: 'empCode and date are required' },
        { status: 400 }
      );
    }

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';

    const emp = await Employee.findOne({ empCode }).lean();
    if (!emp) {
      return NextResponse.json(
        { error: `Employee ${empCode} not found` },
        { status: 404 }
      );
    }

    // Get shift for this specific date (considering shift history)
    // Pass employee object to avoid extra DB query
    const shiftObj = await getShiftForDate(empCode, date, emp);
    let shiftCode = '';
    if (shiftObj) {
      shiftCode = shiftObj.code;
    } else {
      // Fallback to legacy shift
      shiftCode = emp.shift || 'D1';
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
        : ['S1', 'S2'].includes(shiftCode);
      
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
      const shiftForCalc = shiftObj || shiftCode;
      const flags = computeLateEarly(shiftForCalc, checkIn, checkOut);
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

    console.log('POST /api/hr/monthly-attendance - Saving excused flags:', {
      date,
      empCode,
      late,
      earlyLeave,
      lateExcused: finalLateExcused,
      earlyExcused: finalEarlyExcused,
      inputLateExcused: lateExcused,
      inputEarlyExcused: earlyExcused,
      inputViolationExcused: violationExcused,
    });

    console.log('POST /api/hr/monthly-attendance - Saving excused flags:', {
      lateExcused: finalLateExcused,
      earlyExcused: finalEarlyExcused,
      late,
      earlyLeave,
      date,
      empCode,
    });

    const hasPunch = !!checkIn || !!checkOut;

    // Determine if this date is a weekend (same logic as GET endpoint)
    const dateObj = new Date(`${date}T00:00:00${TZ}`);
    const localMs = dateObj.getTime() + COMPANY_OFFSET_MS;
    const local = new Date(localMs);
    const dow = local.getUTCDay(); // Day of week in company timezone
    
    let isWeekendOff = false;
    if (dow === 0) {
      isWeekendOff = true; // Sunday
    } else if (dow === 6) {
      // Saturday: check if it's an alternating Saturday off
      // For now, treat all Saturdays as off (can be customized)
      isWeekendOff = true;
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
      updatedAt: new Date(),
    };

    // Delete any existing records for this date/empCode (in case shift changed)
    // Then insert/update with the new shift
    await ShiftAttendance.deleteMany({ date, empCode });
    await ShiftAttendance.create(update);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/hr/monthly-attendance error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
