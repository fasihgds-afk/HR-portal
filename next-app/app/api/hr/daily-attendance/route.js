// next-app/app/api/hr/daily-attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import EmployeeShiftHistory from '../../../../models/EmployeeShiftHistory';
import Shift from '../../../../models/Shift';

export const dynamic = 'force-dynamic'; // avoid caching in dev

/**
 * Classify a punch time to a shift code using dynamic shifts from database
 * 
 * TIMEZONE HANDLING:
 * - Sync service stores eventTime as Date object with timezone from TIMEZONE_OFFSET env
 * - This function receives the Date object and compares it against shift timings
 * - All time comparisons are done in local timezone (matching sync service)
 * 
 * @param {Date} localDate - The punch time (Date object from MongoDB, already in correct timezone)
 * @param {String} businessDateStr - Business date in YYYY-MM-DD format
 * @param {String} tzOffset - Timezone offset (e.g., "+05:00") - used for reference
 * @param {Array} shifts - Array of shift objects from database
 * @returns {String|null} - Shift code or null if no match
 */
function classifyByTime(localDate, businessDateStr, tzOffset, shifts) {
  if (!shifts || shifts.length === 0) return null;

  const businessStartLocal = new Date(`${businessDateStr}T00:00:00${tzOffset}`);
  const nextDayLocal = new Date(businessStartLocal);
  nextDayLocal.setDate(nextDayLocal.getDate() + 1);

  const localDateStr = localDate.toISOString().slice(0, 10);
  const nextDayStr = nextDayLocal.toISOString().slice(0, 10);

  const h = localDate.getHours();
  const m = localDate.getMinutes();
  const punchMinutes = h * 60 + m; // minutes after midnight 0–1439

  // Helper to parse HH:mm to minutes
  function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Check each shift to see if punch time falls within its window
  for (const shift of shifts) {
    if (!shift.isActive) continue;

    const startMin = parseTime(shift.startTime);
    let endMin = parseTime(shift.endTime);

    // Handle shifts that cross midnight
    if (shift.crossesMidnight) {
      endMin += 24 * 60; // Add 24 hours for next day
    }

    // Check if punch is on business date and within shift window
    if (shift.crossesMidnight) {
      // Night shift: can start on business date and end on next day
      const isOnStartDay = localDateStr === businessDateStr && punchMinutes >= startMin;
      const isOnEndDay = localDateStr === nextDayStr && punchMinutes < (endMin % (24 * 60));
      
      if (isOnStartDay || isOnEndDay) {
        return shift.code;
      }
    } else {
      // Day shift: same day only
      if (localDateStr === businessDateStr && punchMinutes >= startMin && punchMinutes < endMin) {
        return shift.code;
      }
    }
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

    // Load ALL active shifts from database (for dynamic classification)
    const allShifts = await Shift.find({ isActive: true }).lean();
    
    if (allShifts.length === 0) {
      return NextResponse.json(
        { error: 'No active shifts found. Please create shifts first.' },
        { status: 400 }
      );
    }

    // Load ALL employees (we want to show present + absent)
    const allEmployees = await Employee.find().lean();

    // Pre-fetch shift history for all employees for this date
    const empCodes = allEmployees.map((e) => e.empCode);
    const shiftHistoryForDate = await EmployeeShiftHistory.find({
      empCode: { $in: empCodes },
      effectiveDate: { $lte: date },
      $or: [{ endDate: null }, { endDate: { $gte: date } }],
    })
      .sort({ effectiveDate: -1 })
      .lean();

    // Build map: empCode -> shiftCode (from history)
    const shiftMap = new Map();
    for (const history of shiftHistoryForDate) {
      if (!shiftMap.has(history.empCode)) {
        shiftMap.set(history.empCode, history.shiftCode);
      }
    }

    // Build shift code to shift object map for quick lookup
    const shiftByCode = new Map();
    for (const shift of allShifts) {
      shiftByCode.set(shift.code, shift);
    }

    // Map for quick lookup: empCode -> info
    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      // Use dynamic shift from history if available, otherwise fallback to employee's shift
      const dynamicShift = shiftMap.get(emp.empCode) || emp.shift || '';
      empInfoMap.set(emp.empCode, {
        name: emp.name || '',
        shift: dynamicShift,
        department: emp.department || '',
        designation: emp.designation || '',
      });
    }

    /**
     * Calculate business day window - ALIGNED WITH SYNC SERVICE
     * Sync service fetches: 09:00 (same day) -> 08:00 (next day)
     * This ensures all events from all shifts (3 day + 2 night) are captured correctly
     * 
     * Business day concept:
     * - Day shifts (D1, D2, D3): Start and end on same day
     * - Night shifts (N1, N2): Start on business date, end on next day
     * - All shifts are covered by the 09:00 -> 08:00 next day window
     */
    const pad = (n) => String(n).padStart(2, '0');
    
    // Business day window: 09:00 (same day) -> 08:00 (next day)
    // This matches the sync service's getBusinessRange() function
    const startLocal = new Date(`${date}T09:00:00${TZ}`);
    
    // Calculate next day for end time (08:00 next day)
    const nextDay = new Date(startLocal);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.getFullYear() + '-' + 
                       pad(nextDay.getMonth() + 1) + '-' + 
                       pad(nextDay.getDate());
    const endLocal = new Date(`${nextDayStr}T08:00:00${TZ}`);

    // Load existing ShiftAttendance records for this date (to preserve saved checkOut times)
    const existingRecords = await ShiftAttendance.find({
      date: date,
    }).lean();
    
    // Calculate next day date for night shift checkOut lookup
    const currentDateObj = new Date(`${date}T00:00:00${TZ}`);
    const nextDateObj = new Date(currentDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = nextDateObj.getFullYear() + '-' + 
                        String(nextDateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(nextDateObj.getDate()).padStart(2, '0');
    
    // Load existing ShiftAttendance records for next day (for night shift checkOut that occurs on next day)
    const nextDayRecords = await ShiftAttendance.find({
      date: nextDateStr,
    }).lean();
    
    // Build map: empCode -> next day record
    const nextDayByEmpCode = new Map();
    for (const record of nextDayRecords) {
      if (record.empCode) {
        nextDayByEmpCode.set(record.empCode, record);
      }
    }
    
    // Build map: empCode -> existing record (if multiple records exist for same empCode, prefer one with checkOut)
    const existingByEmpCode = new Map();
    for (const record of existingRecords) {
      const existing = existingByEmpCode.get(record.empCode);
      // If we already have a record for this empCode, prefer the one with checkOut if current doesn't have it
      if (!existing || (!existing.checkOut && record.checkOut)) {
        existingByEmpCode.set(record.empCode, record);
      }
    }

    // Fetch all successful access events in the business day window
    // Window: 09:00 (business date) -> 08:00 (next day)
    // This matches the sync service's business day window to ensure all events are captured
    // Sync service: getBusinessRange() fetches 09:00 -> 08:00 next day
    console.log(`📅 Fetching events for business day ${date} from ${startLocal.toISOString()} to ${endLocal.toISOString()}`);
    
    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38, // "valid access" events only
    })
    .sort({ eventTime: 1 }) // Sort by time ascending for proper processing
    .lean();

    console.log(`📥 Found ${events.length} events in business day window for ${date}`);

    // Group punches by employee (only those who have events)
    const byEmp = new Map();

    for (const ev of events) {
      if (!ev.empCode) continue;

      // eventTime is stored as UTC Date in MongoDB (from sync service)
      // The sync service stores it correctly with timezone, so we can use it directly
      const local = new Date(ev.eventTime);
      const timeShift = classifyByTime(local, date, TZ, allShifts); // Dynamic shift code or null

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
          detectedShifts: new Set(), // Track all detected shift codes dynamically
        };
        byEmp.set(ev.empCode, rec);
      }

      rec.times.push(local);

      if (timeShift) {
        rec.detectedShifts.add(timeShift);
      }
    }

    const items = [];

    // Build one row PER EMPLOYEE (even if no punches)
    for (const emp of allEmployees) {
      const rec = byEmp.get(emp.empCode);
      const existingRecord = existingByEmpCode.get(emp.empCode);

      const times = rec?.times ? [...rec.times].sort((a, b) => a - b) : [];

      // Use checkIn from events if available, otherwise from existing record
      let checkIn = times[0] || null;
      if (!checkIn && existingRecord?.checkIn) {
        checkIn = new Date(existingRecord.checkIn);
      }

      // Determine checkOut: prefer from events if multiple punches, otherwise use existing record or next day's record
      // IMPORTANT: For night shifts, checkout can be on next day, so we need to be careful not to use
      // checkout events from current day (which belong to previous day's shift)
      let checkOut = null;
      
      // Get employee's assigned shift to determine if it's a night shift
      const empAssignedShift = rec?.assignedShift || emp.shift || '';
      const shiftObjForCheckOut = shiftByCode.get(empAssignedShift);
      const isNightShiftForCheckOut = shiftObjForCheckOut?.crossesMidnight === true;
      
      if (times.length > 1) {
        // For night shifts: checkout is on next day, so don't use latest punch from current day's events
        // Instead, we'll get checkout from next day's events later in the code
        if (!isNightShiftForCheckOut) {
          // Day shifts: checkout is on same day, use latest punch
          checkOut = times[times.length - 1];
        }
        // For night shifts, checkOut will be set later from next day's events
      } else if (existingRecord && existingRecord.checkOut != null && !isNightShiftForCheckOut) {
        // For day shifts: use existing checkout if available
        // For night shifts: don't use existing checkout from current day (it might be from previous shift)
        checkOut = new Date(existingRecord.checkOut);
      }
      
      // ====================================================================================
      // NIGHT SHIFT CHECKOUT RETRIEVAL (for all dates going forward)
      // ====================================================================================
      // For night shifts that cross midnight: checkOut occurs on the next day
      // This logic ensures checkOut is retrieved correctly for ALL dates:
      // - Current day (e.g., Jan 1) → checkOut on next day (Jan 2)
      // - Month-end (e.g., Jan 31) → checkOut on next month (Feb 1)
      // - Year-end (e.g., Dec 31) → checkOut on next year (Jan 1)
      // 
      // The main events query should already include next day early morning events (up to latest shift end time),
      // but we also check next day's ShiftAttendance record and query events directly as a fallback
      // ====================================================================================
      if (!checkOut && checkIn) {
        // Use employee's assigned shift already determined above (empAssignedShift)
        // Get shift object from database to check crossesMidnight property
        // This is the PRIMARY and RELIABLE way to detect night shifts (works for all shifts)
        const shiftObj = shiftByCode.get(empAssignedShift);
        
        // Check if this is a night shift:
        // PRIMARY: Use crossesMidnight property from shift definition (most reliable, works for all shifts)
        // This prevents incorrect matching for day shifts
        const isNightShift = shiftObj?.crossesMidnight === true;
        
        if (isNightShift) {
          // ====================================================================================
          // NIGHT SHIFT CHECKOUT RETRIEVAL FROM NEXT DAY
          // ====================================================================================
          // For night shifts that cross midnight: checkOut occurs on the next day
          // Example: N2 shift starting Jan 1 at 21:00 ends on Jan 2 at 06:00
          // 
          // DATA SOURCE EXPLANATION:
          // When viewing Jan 1st, checkout times (06:31:37, 05:48:38, etc.) are retrieved from:
          // 1. Jan 2nd's ShiftAttendance records (if already saved) - OR
          // 2. Jan 2nd's AttendanceEvent records (directly from device, 00:00-08:00 window)
          // 
          // This checkout time is then DISPLAYED and SAVED to Jan 1st's record because:
          // - The shift started on Jan 1st, so Jan 1st is the "business date" for this shift
          // - Even though checkout physically occurs on Jan 2nd, it belongs to Jan 1st's shift
          // - This allows the complete shift record (checkIn + checkOut) to be viewed on Jan 1st
          // 
          // Strategy:
          // 1. First check next day's ShiftAttendance record (if it exists)
          // 2. If not found, query AttendanceEvent records directly for next day early morning (00:00-08:00)
          // 3. Validate using time-based logic to ensure checkOut belongs to current day's shift
          // ====================================================================================
          
          // Try next day's ShiftAttendance record first
          // We'll validate it belongs to current day's shift later by checking checkIn date
          const nextDayRecord = nextDayByEmpCode.get(emp.empCode);
          let nextDayCheckOut = null;
          
          if (nextDayRecord && nextDayRecord.checkOut) {
            try {
              nextDayCheckOut = new Date(nextDayRecord.checkOut);
              if (isNaN(nextDayCheckOut.getTime())) {
                nextDayCheckOut = null;
              }
            } catch (e) {
              nextDayCheckOut = null;
            }
          }
          
          // If not found in ShiftAttendance, query AttendanceEvent directly for next day early morning
          // This fallback ensures checkOut is retrieved correctly for ALL dates:
          // - Regular days: Jan 1 → check Jan 2, Jan 15 → check Jan 16, etc.
          // - Month-end: Jan 31 → check Feb 1, Feb 28/29 → check Mar 1, etc.
          // - Year-end: Dec 31 → check Jan 1 (next year)
          // The query uses dynamically calculated nextDateStr, so it works for any date
          if (!nextDayCheckOut) {
            try {
              // Query events from next day 00:00 to 08:00 (early morning checkOut belongs to previous night shift)
              // Using 08:00 as cutoff covers all night shift end times (N1: 03:00, N2: 06:00, etc.)
              const nextDayStartLocal = new Date(`${nextDateStr}T00:00:00${TZ}`);
              const nextDayEndLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);
              
              const nextDayEvents = await AttendanceEvent.find({
                empCode: emp.empCode,
                eventTime: { $gte: nextDayStartLocal, $lte: nextDayEndLocal },
                minor: 38, // "valid access" events only
              })
              .sort({ eventTime: 1 }) // Sort by time ascending
              .limit(1) // Only need the first (earliest) event
              .lean();
              
              // Get the earliest event on next day (which is the checkOut from previous night shift)
              if (nextDayEvents.length > 0) {
                nextDayCheckOut = new Date(nextDayEvents[0].eventTime);
              }
            } catch (e) {
              // Ignore errors - will continue without checkOut
            }
          }
          
          // If we found a checkOut from next day, validate it belongs to current day's shift
          // CRITICAL: We must verify the checkOut belongs to the CURRENT business date's shift, not previous day's shift
          // Example: Dec 31 N2 shift ends Jan 1 at 06:00, but Jan 1 N2 shift starts Jan 1 at 21:00 and ends Jan 2 at 06:00
          // When viewing Jan 1: We should NOT show Jan 1 checkout at 06:00 (from Dec 31 shift)
          // We SHOULD show Jan 2 checkout at 06:00 (from Jan 1 shift)
          if (nextDayCheckOut && !isNaN(nextDayCheckOut.getTime())) {
            try {
              // Get current time to check if checkOut is in the future
              const now = new Date();
              
              // Only proceed if checkOut time has actually occurred (checkOut <= now)
              // This prevents showing future checkout times when viewing today's data
              if (nextDayCheckOut > now) {
                // CheckOut is in the future - don't show it yet
                nextDayCheckOut = null;
              } else if (!checkIn) {
                // No checkIn for current day - can't verify this checkout belongs to current day's shift
                nextDayCheckOut = null;
              } else {
                // For validation: Use timezone-aware date string creation for reliable comparison
                // Helper function to get local date string (YYYY-MM-DD) from UTC Date object
                const getLocalDateStr = (utcDate, tzOffset) => {
                  // Parse timezone offset (e.g., "+05:00" -> 5 hours)
                  const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
                  if (!offsetMatch) return utcDate.toISOString().slice(0, 10);
                  
                  const sign = offsetMatch[1] === '+' ? 1 : -1;
                  const hours = parseInt(offsetMatch[2]);
                  const minutes = parseInt(offsetMatch[3]);
                  const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
                  
                  // Create date in local timezone by adding offset
                  const localDate = new Date(utcDate.getTime() + offsetMs);
                  
                  // Extract date components (these will be in local timezone since we adjusted)
                  const year = localDate.getUTCFullYear();
                  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                  const day = String(localDate.getUTCDate()).padStart(2, '0');
                  return `${year}-${month}-${day}`;
                };
                
                const checkInDateStr = getLocalDateStr(checkIn, TZ);
                
                // CRITICAL: Compare checkIn date with business date
                // This ensures we only show checkout for shifts that STARTED on the business date
                // Example: When viewing Jan 1, we should NOT show checkout from Dec 31 shift (Dec 31 check-in)
                // We SHOULD show checkout from Jan 1 shift (Jan 1 check-in, checkout on Jan 2)
                if (checkInDateStr !== date) {
                  // CheckIn is NOT on the business date - this checkout belongs to previous day's shift
                  // Example: Viewing Jan 1, but checkIn was Dec 31 - this checkout is from Dec 31's shift, not Jan 1's
                  nextDayCheckOut = null;
                } else {
                  // CheckIn is on the business date - validate checkout timing
                  const checkOutDateStr = getLocalDateStr(nextDayCheckOut, TZ);
                  
                  // Get checkout time in local timezone for time validation
                  const offsetMatch = TZ.match(/([+-])(\d{2}):(\d{2})/);
                  const tzHours = offsetMatch ? (offsetMatch[1] === '+' ? 1 : -1) * parseInt(offsetMatch[2]) : 5;
                  const checkOutLocalTime = new Date(nextDayCheckOut.getTime() + (tzHours * 60 * 60 * 1000));
                  const checkOutHour = checkOutLocalTime.getUTCHours();
                  const checkOutMin = checkOutLocalTime.getUTCMinutes();
                  const checkOutTotalMin = checkOutHour * 60 + checkOutMin;
                  
                  // Verify checkout is on next day and before 08:00
                  if (checkOutDateStr !== nextDateStr) {
                    // Checkout is NOT on the next day
                    nextDayCheckOut = null;
                  } else if (checkOutTotalMin >= 480) {
                    // Checkout is after 08:00 - too late to be from previous night shift
                    nextDayCheckOut = null;
                  } else {
                    // Checkout is on next day, before 08:00, and checkIn is on business date
                    // This checkout belongs to current day's night shift (N1 ends at 03:00, N2 ends at 06:00)
                    checkOut = nextDayCheckOut;
                  }
                }
              }
            } catch (e) {
              // Ignore errors
              nextDayCheckOut = null;
            }
          }
        }
      }

      // Final shift decision:
      // 1) Prefer employee's assigned shift (from history or Employee.shift)
      // 2) Otherwise infer from detected punch times
      let shift = 'Unknown';
      const assignedShift = rec?.assignedShift || emp.shift || '';

      // Check if assigned shift exists in database
      if (assignedShift && shiftByCode.has(assignedShift)) {
        shift = assignedShift;
      } else if (rec?.detectedShifts && rec.detectedShifts.size > 0) {
        // Use first detected shift (or could prioritize by most punches)
        shift = Array.from(rec.detectedShifts)[0];
      }

      // Calculate total punches: count events found, but also count checkOut if it exists from existing record or next day's record
      let totalPunches = times.length;
      // If we're using checkOut from existing record or next day's record but didn't have events for it, count it
      if (totalPunches === 0 && (existingRecord?.checkIn || checkIn)) {
        totalPunches = checkOut ? 2 : (checkIn ? 1 : 0);
      } else if (totalPunches === 1 && checkOut && times.length === 1) {
        // If we have one event but also have checkOut from existing record or next day's record, count as 2
        totalPunches = 2;
      }
      
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
    // Build dynamic shift order from database shifts
    const shiftOrder = new Map();
    allShifts.forEach((s, idx) => {
      shiftOrder.set(s.code, idx + 1);
    });
    shiftOrder.set('Unknown', 999);
    
    items.sort((a, b) => {
      const sa = shiftOrder.get(a.shift) ?? 999;
      const sb = shiftOrder.get(b.shift) ?? 999;
      if (sa !== sb) return sa - sb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return NextResponse.json({
      date,
      savedCount: presentItems.length,
      items,
    });
  } catch (err) {
    console.error('HR daily-attendance error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

