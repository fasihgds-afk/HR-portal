// next-app/app/api/hr/shift-attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';

export const dynamic = 'force-dynamic'; // avoid caching in dev

/**
 * Decide which shift window a LOCAL time belongs to
 * for the given business date.
 *
 * Shifts (local time):
 * - D1 : 09:00–18:00
 * - D2 : 15:00–24:00
 * - D3 : 12:00–21:00
 * - S1 : 18:00–03:00 (next day)
 * - S2 : 21:00–06:00 (next day)
 *
 * IMPORTANT:
 * This is only a *hint*. Final shift comes from Employee.shift
 * if it is set (D1/D2/D3/S1/S2). Time-based detection is only
 * used as a fallback for employees without an assigned shift.
 */
function classifyByTime(localDate, businessDateStr, tzOffset) {
  const businessStartLocal = new Date(`${businessDateStr}T00:00:00${tzOffset}`);
  const nextDayLocal = new Date(businessStartLocal);
  nextDayLocal.setDate(nextDayLocal.getDate() + 1);

  const localDateStr = localDate.toISOString().slice(0, 10);
  const nextDayStr = nextDayLocal.toISOString().slice(0, 10);

  const h = localDate.getHours();
  const m = localDate.getMinutes();
  const t = h * 60 + m; // minutes after midnight 0–1439

  // ---- Day shifts (same calendar day only) ----
  // D1: 09:00–17:59  (we stop at 17:59 so D2 can "own" 15:00–24:00)
  if (localDateStr === businessDateStr && t >= 9 * 60 && t < 18 * 60) {
    return 'D1';
  }

  // D3: 12:00–20:59 (same day)
  if (localDateStr === businessDateStr && t >= 12 * 60 && t < 21 * 60) {
    return 'D3';
  }

  // D2: 15:00–23:59 (purely same day)
  if (localDateStr === businessDateStr && t >= 15 * 60 && t < 24 * 60) {
    return 'D2';
  }

  // ---- Night shift S1 ----
  // S1: 18:00–23:59 same day
  if (localDateStr === businessDateStr && t >= 18 * 60 && t < 24 * 60) {
    return 'S1';
  }
  // S1: 00:00–02:59 next day
  if (localDateStr === nextDayStr && t < 3 * 60) {
    return 'S1';
  }

  // ---- Night shift S2 ----
  // S2: 21:00–23:59 same day
  if (localDateStr === businessDateStr && t >= 21 * 60 && t < 24 * 60) {
    return 'S2';
  }
  // S2: 00:00–05:59 next day
  if (localDateStr === nextDayStr && t >= 0 && t < 6 * 60) {
    return 'S2';
  }

  return null;
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // "YYYY-MM-DD"

    if (!date) {
      return NextResponse.json(
        { error: 'Missing "date" query parameter' },
        { status: 400 }
      );
    }

    await connectDB();

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';

    // Load ALL employees (we want to show present + absent)
    const allEmployees = await Employee.find().lean();

    // Map for quick lookup: empCode -> info
    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      empInfoMap.set(emp.empCode, {
        name: emp.name || '',
        shift: emp.shift || '',
        department: emp.department || '',
        designation: emp.designation || '',
      });
    }

    /**
     * We want one "business day" that includes:
     *  - All D1 punches (09:00–18:00 same day)
     *  - All D2 punches (15:00–24:00 same day)
     *  - All D3 punches (12:00–21:00 same day)
     *  - S1 punches (18:00 same day → 03:00 next day)
     *  - S2 punches (21:00 same day → 06:00 next day)
     *
     * Safe window: [date 09:00] → [next day 06:00]
     */
    const startLocal = new Date(`${date}T09:00:00${TZ}`);
    const endLocal = new Date(`${date}T09:00:00${TZ}`);
    endLocal.setDate(endLocal.getDate() + 1); // +1 day
    endLocal.setHours(8, 0, 0, 0); // 08:00 next day

    // Fetch all successful access events in the window
    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38, // "valid access" events only
    }).lean();

    // Group punches by employee (only those who have events)
    const byEmp = new Map();

    for (const ev of events) {
      if (!ev.empCode) continue;

      const local = new Date(ev.eventTime);
      const timeShift = classifyByTime(local, date, TZ); // D1 / D2 / D3 / S1 / S2 / null

      let rec = byEmp.get(ev.empCode);
      if (!rec) {
        const info = empInfoMap.get(ev.empCode) || {};
        rec = {
          empCode: ev.empCode,
          employeeName: info.name || ev.employeeName || ev.raw?.name || '',
          assignedShift: info.shift || '',
          department: info.department || '',
          designation: info.designation || '',
          times: [],
          hasD1: false,
          hasD2: false,
          hasD3: false,
          hasS1: false,
          hasS2: false,
        };
        byEmp.set(ev.empCode, rec);
      }

      rec.times.push(local);

      if (timeShift === 'D1') rec.hasD1 = true;
      if (timeShift === 'D2') rec.hasD2 = true;
      if (timeShift === 'D3') rec.hasD3 = true;
      if (timeShift === 'S1') rec.hasS1 = true;
      if (timeShift === 'S2') rec.hasS2 = true;
    }

    const items = [];

    // Build one row PER EMPLOYEE (even if no punches)
    for (const emp of allEmployees) {
      const rec = byEmp.get(emp.empCode);

      const times = rec?.times ? [...rec.times].sort((a, b) => a - b) : [];

      const checkIn = times[0] || null;

      // only set checkOut if there is more than one punch
      let checkOut = null;
      if (times.length > 1) {
        checkOut = times[times.length - 1];
      }

      // Final shift decision:
      // 1) Prefer employee's assigned shift
      // 2) Otherwise infer from punches
      let shift = 'Unknown';
      const assignedShift = emp.shift || rec?.assignedShift || '';

      if (['D1', 'D2', 'D3', 'S1', 'S2'].includes(assignedShift)) {
        shift = assignedShift;
      } else if (rec?.hasD1) {
        shift = 'D1';
      } else if (rec?.hasD2) {
        shift = 'D2';
      } else if (rec?.hasD3) {
        shift = 'D3';
      } else if (rec?.hasS1) {
        shift = 'S1';
      } else if (rec?.hasS2) {
        shift = 'S2';
      }

      const totalPunches = times.length;
      const attendanceStatus = totalPunches > 0 ? 'Present' : 'Absent';

      items.push({
        empCode: emp.empCode,
        employeeName: emp.name || rec?.employeeName || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift,
        checkIn,
        checkOut,
        totalPunches,
        attendanceStatus,
      });
    }

    // Save snapshot into ShiftAttendance ONLY for present employees
    const presentItems = items.filter((item) => item.totalPunches > 0);

    const bulkOps = presentItems.map((item) => ({
      updateOne: {
        filter: {
          date,
          empCode: item.empCode,
          shift: item.shift,
        },
        update: {
          $set: {
            date,
            empCode: item.empCode,
            employeeName: item.employeeName,
            department: item.department || '',
            designation: item.designation || '',
            shift: item.shift,
            checkIn: item.checkIn,
            checkOut: item.checkOut || null,
            totalPunches: item.totalPunches,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await ShiftAttendance.bulkWrite(bulkOps);
    }

    // Sort output: department already handled on UI,
    // here we just keep shift order & then empCode
    const shiftOrder = { D1: 1, D2: 2, D3: 3, S1: 4, S2: 5, Unknown: 6 };
    items.sort((a, b) => {
      const sa = shiftOrder[a.shift] ?? 99;
      const sb = shiftOrder[b.shift] ?? 99;
      if (sa !== sb) return sa - sb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return NextResponse.json({
      date,
      savedCount: presentItems.length,
      items,
    });
  } catch (err) {
    console.error('HR shift-attendance error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
