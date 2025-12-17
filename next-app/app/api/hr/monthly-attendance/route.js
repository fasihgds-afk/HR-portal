// app/api/hr/monthly-attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';

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

// D1: 09:00–18:00
// D2: 15:00–24:00
// D3: 12:00–21:00
// S1: 18:00–03:00 next day
// S2: 21:00–06:00 next day (Saturday S2 behaves like S1: 18–03)
// Returns:
//  - late / earlyLeave flags (true/false)
//  - lateMinutes / earlyMinutes = minutes BEYOND 15-min grace
function computeLateEarly(shift, checkIn, checkOut) {
  if (!shift || !checkIn || !checkOut) {
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // convert both punches into company-local minutes
  let inMin = toCompanyMinutes(checkIn);
  let outMin = toCompanyMinutes(checkOut);

  let startMin = 0;
  let endMin = 0;

  const isSaturday = isCompanySaturday(checkIn);

  switch (shift) {
    case 'D1':
      startMin = toMinutes(9, 0);
      endMin = toMinutes(18, 0);
      break;
    case 'D2':
      startMin = toMinutes(15, 0);
      endMin = toMinutes(24, 0); // 24:00
      break;
    case 'D3':
      startMin = toMinutes(12, 0);
      endMin = toMinutes(21, 0); // 21:00
      break;
    case 'S1':
      startMin = toMinutes(18, 0);
      endMin = toMinutes(27, 0); // 03:00 next day
      break;
    case 'S2':
      if (isSaturday) {
        // Saturday S2 acts like S1
        startMin = toMinutes(18, 0);
        endMin = toMinutes(27, 0);
      } else {
        startMin = toMinutes(21, 0);
        endMin = toMinutes(30, 0); // 06:00 next day
      }
      break;
    default:
      startMin = toMinutes(9, 0);
      endMin = toMinutes(18, 0);
  }

  // if shift crosses midnight, normalise outMin
  const startClock = startMin % (24 * 60);
  if (['D2', 'S1', 'S2'].includes(shift) && outMin < startClock) {
    outMin += 24 * 60;
  }

  let lateMinutesTotal = inMin - startMin;
  if (lateMinutesTotal < 0) lateMinutesTotal = 0;

  let earlyMinutesTotal = endMin - outMin;
  if (earlyMinutesTotal < 0) earlyMinutesTotal = 0;

  const GRACE = 15; // 15-minute grace

  const late = lateMinutesTotal > GRACE;
  const earlyLeave = earlyMinutesTotal > GRACE;

  // Violation minutes = minutes AFTER grace
  const lateMinutes = late ? lateMinutesTotal - GRACE : 0;
  const earlyMinutes = earlyLeave ? earlyMinutesTotal - GRACE : 0;

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

  if (lower === 'late arrival without info' || lower === 'la') {
    return 'Late Arrival Without Info';
  }
  if (lower === 'early departure' || lower === 'ed') {
    return 'Early departure';
  }
  if (lower === 'info late arrival' || lower === 'info late') {
    return 'Info Late Arrival';
  }
  if (lower === 'sick leave' || lower === 'sl') {
    return 'Sick Leave';
  }
  if (lower === 'paid leave' || lower === 'pl') {
    return 'Paid Leave';
  }
  if (lower === 'un paid leave' || lower === 'unpaid leave' || lower === 'upl') {
    return 'Un Paid Leave';
  }
  if (lower === 'new induction' || lower === 'ni') {
    return 'New Induction';
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

    const employees = await Employee.find(
      {},
      {
        empCode: 1,
        name: 1,
        department: 1,
        designation: 1,
        shift: 1,
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
        _id: 0,
      }
    ).lean();

    const docsByEmpDate = new Map();
    for (const doc of shiftDocs) {
      if (!doc.empCode || !doc.date) continue;
      docsByEmpDate.set(`${doc.empCode}|${doc.date}`, doc);
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

        // Always use employee's current shift for calculations (ensures D3 employees get D3 calculations)
        // This ensures old records are recalculated with the correct shift
        const shift = empShift || doc?.shift || 'D1';
        // Validate shift is one of the known shifts
        const validShift = ['D1', 'D2', 'D3', 'S1', 'S2'].includes(shift) ? shift : (empShift || 'D1');

        if (isFutureDay) {
          days.push({
            date,
            shift,
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
            if (hasPunch) {
              status = 'Present';
            } else if (isWeekendOff) {
              status = 'Holiday';
            } else {
              status = 'Absent';
            }
          }
        }

        const reason = doc?.reason || '';
        const excused = !!doc?.excused;

        let late = false;
        let earlyLeave = false;
        let dayViolationMinutes = 0;

        // Late / Early calculation only if both punches and not a holiday
        // Use validShift to ensure correct shift is used for calculations
        if (checkIn && checkOut && status !== 'Holiday') {
          const flags = computeLateEarly(validShift, checkIn, checkOut);
          late = !!flags.late;
          earlyLeave = !!flags.earlyLeave;

          const lateMinutes = flags.lateMinutes || 0;
          const earlyMinutes = flags.earlyMinutes || 0;

          dayViolationMinutes = lateMinutes + earlyMinutes;

          if (late && !excused) {
            lateCount++;
            totalLateMinutes += lateMinutes;
          }
          if (earlyLeave && !excused) {
            earlyCount++;
            totalEarlyMinutes += earlyMinutes;
          }

          const hasViolationDay = (late || earlyLeave) && !excused;

          // ---------------- SALARY RULES FOR VIOLATION DAYS -----------------
          if (hasViolationDay) {
            violationDaysCount += 1;
            const vNo = violationDaysCount;

            // Every 3rd violation day → 1 full day salary
            if (vNo % 3 === 0) {
              violationBaseDays += 1;
              // 3rd, 6th, 9th, ... → full days only (no per-minute)
            } else if (vNo > 3) {
              // 4th, 5th, 7th, 8th, 10th, 11th, ...
              // per-minute fine based on that day’s violation minutes
              // each minute → 0.007 day
              perMinuteFineDays += dayViolationMinutes * 0.007;
            }
          }
        }

        // ----------------- MISSING PUNCH DEDUCTION -----------------------
        const partialPunch =
          (checkIn && !checkOut) || (!checkIn && checkOut);

        // If check-in OR check-out is missing:
        //  → deduct 1 full day salary
        //  → unless excused, or a leave/holiday status
        if (
          partialPunch &&
          !excused &&
          status !== 'Holiday' &&
          status !== 'Paid Leave' &&
          status !== 'Un Paid Leave' &&
          status !== 'Sick Leave' &&
          status !== 'Work From Home'
        ) {
          missingPunchDays += 1;
        }

        // ----------------- ABSENT / LEAVE / HALF-DAY RULES ----------------
        if (!hasPunch) {
          if (status === 'Un Paid Leave') {
            unpaidLeaveDays += 1;
          } else if (status === 'Absent') {
            // Absent without any punch → 1 day salary deduction
            absentDays += 1;
          }
        }

        if (status === 'Half Day') {
          halfDays += 0.5;
        }

        days.push({
          date,
          shift: validShift, // Use validated shift to ensure D3 is properly stored
          status,
          reason,
          checkIn: checkIn ? checkIn.toISOString() : null,
          checkOut: checkOut ? checkOut.toISOString() : null,
          late,
          earlyLeave,
          excused,
          isFuture: false,
        });
      }

      // -------------------- FINAL SALARY DEDUCTION ----------------------
      // Base from violations (3rd, 6th, 9th, ...)
      const violationFullDays = violationBaseDays;

      // Per-minute violation days for 4th,5th,7th,8th,...
      const perMinuteDays = perMinuteFineDays;

      // Other deductions
      const salaryDeductDaysRaw =
        violationFullDays +
        perMinuteDays +
        missingPunchDays +
        unpaidLeaveDays +
        absentDays +
        halfDays;

      const salaryDeductDays = Number(salaryDeductDaysRaw.toFixed(3));

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

    return NextResponse.json({
      month: monthPrefix,
      daysInMonth,
      employees: employeesOut,
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
      violationExcused,
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

    const shift = emp.shift || 'D1';

    let checkIn = null;
    let checkOut = null;

    // store with explicit offset (+05:00) – absolute time is correct everywhere
    if (checkInTime) {
      checkIn = new Date(`${date}T${checkInTime}:00${TZ}`);
    }

    if (checkOutTime) {
      let coDate = date;
      if (['D2', 'S1', 'S2'].includes(shift)) {
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
      const flags = computeLateEarly(shift, checkIn, checkOut);
      late = flags.late;
      earlyLeave = flags.earlyLeave;
    }

    const hasPunch = !!checkIn || !!checkOut;

    let rawStatus = status;
    let attendanceStatus;

    if (!rawStatus) {
      if (hasPunch) {
        rawStatus = 'Present';
      } else {
        rawStatus = 'Absent';
      }
    }

    attendanceStatus = normalizeStatus(rawStatus, { isWeekendOff: false });

    const totalPunches = checkIn && checkOut ? 2 : hasPunch ? 1 : 0;

    const update = {
      date,
      empCode,
      employeeName: emp.name || '',
      department: emp.department || '',
      designation: emp.designation || '',
      shift,
      checkIn,
      checkOut,
      totalPunches,
      attendanceStatus,
      reason: reason || '',
      late,
      earlyLeave,
      excused: !!violationExcused,
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
