// next-app/app/api/hr/daily-attendance/route.js
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
// EmployeeShiftHistory removed - using employee's current shift from Employee model directly
// This ensures shift updates from employee manage page are immediately reflected
import Shift from '../../../../models/Shift';
// Cache removed for simplicity and real-time data

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
      throw new ValidationError('Missing "date" query parameter');
    }

    await connectDB();

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';

    // Load ALL active shifts from database (for dynamic classification)
    // OPTIMIZATION: Use cached shifts if available (shifts rarely change)
    const { getCachedShifts } = await import('../../../../lib/cache/shiftCache');
    let allShifts = getCachedShifts(true); // Get active shifts from cache
    
    if (!allShifts) {
      allShifts = await Shift.find({ isActive: true }).lean();
      // Cache will be set by shifts route, no need to set here
    }
    
    if (allShifts.length === 0) {
      throw new ValidationError('No active shifts found. Please create shifts first.');
    }

    // Calculate next day date for night shift checkOut lookup
    // Parse the date string (YYYY-MM-DD) and add 1 day
    // Use simple date arithmetic to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const currentDateObj = new Date(Date.UTC(year, month - 1, day));
    const nextDateObj = new Date(currentDateObj);
    nextDateObj.setUTCDate(nextDateObj.getUTCDate() + 1);
    const nextDateStr = nextDateObj.getUTCFullYear() + '-' + 
                       String(nextDateObj.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                       String(nextDateObj.getUTCDate()).padStart(2, '0');

    // PERFORMANCE: Parallelize independent queries
    const [allEmployees, existingRecords, nextDayRecords] = await Promise.all([
      // Load ALL employees (we want to show present + absent)
      // Use optimized projection - exclude large base64 images
      Employee.find()
        .select('empCode name shift department designation')
        .lean(),
      
      // Load existing ShiftAttendance records for this date
      ShiftAttendance.find({ date: date }).lean(),
      
      // Load existing ShiftAttendance records for next day (for night shift checkOut)
      ShiftAttendance.find({ date: nextDateStr }).lean(),
    ]);

    // Build shift code to shift object map for quick lookup
    const shiftByCode = new Map();
    // Also build shiftId (ObjectId) to shift code map for handling ObjectId values
    const shiftById = new Map();
    for (const shift of allShifts) {
      shiftByCode.set(shift.code, shift);
      // Map both _id (ObjectId) and string representation to shift code
      if (shift._id) {
        shiftById.set(shift._id.toString(), shift.code);
        shiftById.set(String(shift._id), shift.code);
      }
    }

    // Helper function to extract shift code from various formats
    // This function handles multiple shift format patterns including ObjectIds
    function extractShiftCode(shiftValue) {
      if (!shiftValue) return '';
      
      // Handle ObjectId (MongoDB ObjectId string format: 24 hex characters)
      // Check if it looks like an ObjectId (24 hex characters)
      const stringValue = String(shiftValue).trim();
      if (!stringValue) return '';
      
      // Pattern: ObjectId (24 hex characters, e.g., "6941d6a487d79351691fea63")
      if (/^[0-9a-fA-F]{24}$/.test(stringValue)) {
        // Look up the shift code from the ObjectId map
        const shiftCode = shiftById.get(stringValue);
        if (shiftCode) {
          return shiftCode;
        }
        // If not found in map, return empty (ObjectId doesn't match any shift)
        return '';
      }
      
      // Try multiple patterns to extract shift code
      // Pattern 1: Direct code like "D1", "N1", "D2", etc.
      const directMatch = stringValue.match(/^([A-Z]\d+)$/i);
      if (directMatch) {
        return directMatch[1].toUpperCase(); // Normalize to uppercase
      }
      
      // Pattern 2: Formatted string like "D1 – Day Shift (09:00–18:00)" or "D1 - Day Shift"
      const formattedMatch = stringValue.match(/^([A-Z]\d+)/i);
      if (formattedMatch) {
        return formattedMatch[1].toUpperCase(); // Normalize to uppercase
      }
      
      // Pattern 3: Already uppercase code
      if (/^[A-Z]\d+$/.test(stringValue)) {
        return stringValue;
      }
      
      // If no pattern matches, return as-is (might be a valid code we don't recognize)
      return stringValue.toUpperCase();
    }

    // Map for quick lookup: empCode -> info
    // IMPORTANT: Use employee's current shift from Employee model (not EmployeeShiftHistory)
    // This ensures shift updates from employee manage page are immediately reflected
    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      // Use employee's current shift directly (same as monthly attendance route)
      // Extract shift code from various possible formats
      const employeeShift = extractShiftCode(emp.shift);
      
      empInfoMap.set(emp.empCode, {
        name: emp.name || '',
        shift: employeeShift,
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
    
    // Use nextDateStr (already calculated above) for end time
    const endLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);

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
    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38, // "valid access" events only
    })
    .sort({ eventTime: 1 }) // Sort by time ascending for proper processing
    .lean();


    // PERFORMANCE: Pre-fetch all next day events for night shift employees in a single batch query
    // This eliminates N+1 query problem (previously querying per employee in loop)
    const nextDayStartLocal = new Date(`${nextDateStr}T00:00:00${TZ}`);
    const nextDayEndLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);
    
    // Get all night shift employee codes (those with crossesMidnight shifts)
    const nightShiftEmpCodes = new Set();
    for (const emp of allEmployees) {
      // Use employee's current shift from Employee model (not from history)
      const empAssignedShift = extractShiftCode(emp.shift);
      const shiftObj = shiftByCode.get(empAssignedShift);
      if (shiftObj?.crossesMidnight === true) {
        nightShiftEmpCodes.add(emp.empCode);
      }
    }
    
    // Batch query: fetch all next day events for all night shift employees at once
    const allNextDayEvents = nightShiftEmpCodes.size > 0
      ? await AttendanceEvent.find({
          empCode: { $in: Array.from(nightShiftEmpCodes) },
          eventTime: { $gte: nextDayStartLocal, $lte: nextDayEndLocal },
          minor: 38, // "valid access" events only
        })
          .sort({ empCode: 1, eventTime: 1 })
          .lean()
      : [];
    
    // Build map: empCode -> array of next day events (sorted by time)
    const nextDayEventsByEmp = new Map();
    for (const event of allNextDayEvents) {
      if (!event.empCode) continue;
      if (!nextDayEventsByEmp.has(event.empCode)) {
        nextDayEventsByEmp.set(event.empCode, []);
      }
      nextDayEventsByEmp.get(event.empCode).push(event);
    }
    

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
      // IMPORTANT: For night shift validation, we ONLY trust checkIn from current day's events
      // Using checkIn from existingRecord can cause issues when validating next day's checkout
      let checkIn = times[0] || null;
      // Only use existingRecord.checkIn if we have NO events for this day (employee didn't check in today)
      // But for night shift checkout validation, we'll only validate if checkIn is from current day's events
      if (!checkIn && existingRecord?.checkIn) {
        checkIn = new Date(existingRecord.checkIn);
      }
      
      // Track if checkIn is from current day's events (for night shift validation)
      const checkInIsFromCurrentDayEvents = times.length > 0 && times[0] != null;

      // Determine checkOut: prefer from events if multiple punches, otherwise use existing record or next day's record
      // IMPORTANT: For night shifts, checkout can be on next day, so we need to be careful not to use
      // checkout events from current day (which belong to previous day's shift)
      let checkOut = null;
      
      // Get employee's assigned shift to determine if it's a night shift
      // Use employee's current shift from Employee model (not from history)
      const empAssignedShift = extractShiftCode(rec?.assignedShift || emp.shift || '');
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
          // IMPORTANT: Only use next day's record if we have checkIn (from events or existing record)
          // This prevents using stale/incorrect data from previous day's shifts
          const nextDayRecord = nextDayByEmpCode.get(emp.empCode);
          let nextDayCheckOut = null;
          
          if (nextDayRecord && nextDayRecord.checkOut && checkIn) {
            try {
              const potentialCheckOut = new Date(nextDayRecord.checkOut);
              if (!isNaN(potentialCheckOut.getTime())) {
                // Validate that checkout is AFTER checkIn time
                // This ensures the checkout belongs to current day's shift, not previous day's shift
                // Example: Jan 1 N1 checkIn at 18:00 → checkout on Jan 2 must be after Jan 1 18:00
                // Example: Jan 1 N2 checkIn at 21:00 → checkout on Jan 2 must be after Jan 1 21:00
                if (potentialCheckOut > checkIn) {
                  nextDayCheckOut = potentialCheckOut;
                }
              }
            } catch (e) {
              nextDayCheckOut = null;
            }
          } else {
          }
          
          // If not found in ShiftAttendance, query AttendanceEvent directly for next day early morning
          // This fallback ensures checkOut is retrieved correctly for ALL dates:
          // - Regular days: Jan 1 → check Jan 2, Jan 15 → check Jan 16, etc.
          // - Month-end: Jan 31 → check Feb 1, Feb 28/29 → check Mar 1, etc.
          // - Year-end: Dec 31 → check Jan 1 (next year)
          // The query uses dynamically calculated nextDateStr, so it works for any date
          // 
          // IMPORTANT: Only query events if we have a checkIn (from events or existing record)
          // This prevents querying for events that might belong to previous day's shift
          if (!nextDayCheckOut && checkIn) {
            try {
              // Helper function to convert UTC Date to local date string (YYYY-MM-DD)
              const getLocalDateStr = (utcDate, tzOffset) => {
                const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
                if (!offsetMatch) {
                  return utcDate.toISOString().slice(0, 10);
                }
                const sign = offsetMatch[1] === '+' ? 1 : -1;
                const hours = parseInt(offsetMatch[2]);
                const minutes = parseInt(offsetMatch[3]);
                const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
                const localTimeMs = utcDate.getTime() + offsetMs;
                const localDate = new Date(localTimeMs);
                const year = localDate.getUTCFullYear();
                const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                const day = String(localDate.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              };
              
              // PERFORMANCE: Use pre-fetched next day events instead of querying per employee
              // This eliminates N+1 query problem - we already fetched all next day events above
              const nextDayEvents = nextDayEventsByEmp.get(emp.empCode) || [];
              
              // Get the first event on next day that is AFTER the checkIn time
              // CRITICAL: We must ensure the checkout belongs to the CURRENT business date's shift
              // The problem: When viewing Jan 2, we query Jan 3 00:00-08:00, but we might also find
              // Jan 2 00:00-08:00 events in the database that belong to Jan 1's shift.
              // 
              // Solution: Validate that:
              // 1. Event is on the NEXT calendar day (nextDateStr)
              // 2. Event time is AFTER checkIn time (ensures it belongs to current day's shift)
              // 
              // Example for Jan 1 N2 shift:
              // - checkIn: Jan 1 21:00 local (16:00 UTC on Jan 1)
              // - checkout: Jan 2 06:00 local (01:00 UTC on Jan 2)
              // - Query: Jan 2 00:00-08:00 local (Jan 1 19:00 - Jan 2 03:00 UTC)
              // - Validation: eventTime (01:00 UTC Jan 2) > checkInTime (16:00 UTC Jan 1) ✅
              // 
              // Example for Jan 2 N2 shift (the problematic case):
              // - checkIn: Jan 2 21:00 local (16:00 UTC on Jan 2)
              // - checkout: Jan 3 06:00 local (01:00 UTC on Jan 3)
              // - Query: Jan 3 00:00-08:00 local (Jan 2 19:00 - Jan 3 03:00 UTC)
              // - Validation: eventTime (01:00 UTC Jan 3) > checkInTime (16:00 UTC Jan 2) ✅
              // - But if we find Jan 2 01:00 UTC event (from Jan 1 shift): 01:00 UTC Jan 2 < 16:00 UTC Jan 2 ❌ (rejected)
              if (nextDayEvents.length > 0) {
                const checkInTime = new Date(checkIn);
                const checkInLocalDateStr = getLocalDateStr(checkIn, TZ);
                
                for (const event of nextDayEvents) {
                  const eventTime = new Date(event.eventTime);
                  const eventLocalDateStr = getLocalDateStr(eventTime, TZ);
                  
                  // CRITICAL VALIDATION:
                  // 1. Event must be on the next calendar day (nextDateStr), not current day
                  // 2. Event must be after checkIn time (to ensure it belongs to current day's shift)
                  // 3. CheckIn must be on the current business date (date)
                  // 
                  // This ensures:
                  // - When viewing Jan 1: checkout from Jan 2 is accepted (nextDateStr = Jan 2, eventLocalDate = Jan 2)
                  // - When viewing Jan 2: checkout from Jan 3 is accepted (nextDateStr = Jan 3, eventLocalDate = Jan 3)
                  // - When viewing Jan 2: checkout from Jan 2 is rejected (nextDateStr = Jan 3, eventLocalDate = Jan 2 ≠ Jan 3)
                  if (eventLocalDateStr === nextDateStr && eventTime > checkInTime && checkInLocalDateStr === date) {
                    nextDayCheckOut = eventTime;
                    break;
                  }
                }
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
                // For validation: Convert UTC Date to local date string (YYYY-MM-DD) in company timezone
                // Use the same approach as monthly-attendance route for consistency
                const getLocalDateStr = (utcDate, tzOffset) => {
                  // Parse timezone offset (e.g., "+05:00" -> 5 hours in milliseconds)
                  const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
                  if (!offsetMatch) {
                    // Fallback: use ISO string
                    return utcDate.toISOString().slice(0, 10);
                  }
                  
                  const sign = offsetMatch[1] === '+' ? 1 : -1;
                  const hours = parseInt(offsetMatch[2]);
                  const minutes = parseInt(offsetMatch[3]);
                  const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
                  
                  // Convert UTC time to local timezone
                  // Add offset to UTC milliseconds to get local time
                  const localTimeMs = utcDate.getTime() + offsetMs;
                  const localDate = new Date(localTimeMs);
                  
                  // Extract date components (use UTC methods since we manually applied offset)
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
                // 
                // We also check that checkout is AFTER checkIn time (done earlier in nextDayRecord check)
                // This ensures the checkout belongs to current day's shift, not previous day's shift
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
                  
                  // Calculate expected checkout date: business date + 1 day
                  const [year, month, day] = date.split('-').map(Number);
                  const expectedCheckOutDate = new Date(Date.UTC(year, month - 1, day));
                  expectedCheckOutDate.setUTCDate(expectedCheckOutDate.getUTCDate() + 1);
                  const expectedCheckOutDateStr = expectedCheckOutDate.getUTCFullYear() + '-' + 
                                                  String(expectedCheckOutDate.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                                                  String(expectedCheckOutDate.getUTCDate()).padStart(2, '0');
                  
                  // Verify checkout is on or after the expected next day and before 08:00
                  // We allow checkout to be on expectedNextDay or later (in case of saved records from future dates)
                  // But we ensure it's before 08:00 to filter out day shift checkouts
                  const checkOutDateParts = checkOutDateStr.split('-').map(Number);
                  const expectedDateParts = expectedCheckOutDateStr.split('-').map(Number);
                  const checkOutDateValue = checkOutDateParts[0] * 10000 + checkOutDateParts[1] * 100 + checkOutDateParts[2];
                  const expectedDateValue = expectedDateParts[0] * 10000 + expectedDateParts[1] * 100 + expectedDateParts[2];
                  
                  if (checkOutDateValue < expectedDateValue) {
                    // Checkout is before the expected next day - this belongs to a previous shift
                    nextDayCheckOut = null;
                  } else if (checkOutDateValue === expectedDateValue && checkOutTotalMin >= 480) {
                    // Checkout is on expected next day but after 08:00 - too late to be from previous night shift
                    nextDayCheckOut = null;
                  } else if (checkOutDateValue > expectedDateValue && checkOutTotalMin >= 480) {
                    // Checkout is on a later date and after 08:00 - this is likely from a future shift
                    // But if it's before 08:00, it could still be from the current shift (edge case: shift extends very late)
                    // For safety, we'll accept it if it's before 08:00 on the checkout date
                    nextDayCheckOut = null;
                  } else {
                    // Checkout is on or after expected next day, and timing is valid
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
      // 1) Prefer employee's current shift from Employee model (updated from manage page)
      // 2) Otherwise infer from detected punch times
      // 3) If employee has a shift assigned but it's not in active shifts, still use it (for display)
      let shift = 'Unknown';
      
      // Get employee's shift from Employee model (most reliable source)
      const empShiftRaw = emp.shift || '';
      let assignedShift = extractShiftCode(empShiftRaw);
      
      // If we couldn't extract from emp.shift, try from rec?.assignedShift (from empInfoMap)
      if (!assignedShift && rec?.assignedShift) {
        assignedShift = extractShiftCode(rec.assignedShift);
      }
      
      // Priority 1: Use employee's assigned shift if it exists (even if not in active shifts)
      // This ensures shifts show correctly even if a shift was deactivated
      if (assignedShift) {
        shift = assignedShift;
      } 
      // Priority 2: Use detected shift from punch times
      else if (rec?.detectedShifts && rec.detectedShifts.size > 0) {
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

    return successResponse(
      {
        date,
        savedCount: presentItems.length,
        items,
      },
      'Daily attendance saved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

