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

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ============================================================================
 * FUTURE-PROOF ATTENDANCE RETRIEVAL SYSTEM
 * ============================================================================
 * 
 * This system handles attendance retrieval with robust validation to prevent
 * incorrect data display. Key principles:
 * 
 * 1. DATA SOURCE PRIORITY (Most Reliable First):
 *    - Saved ShiftAttendance records (validated and corrected)
 *    - Raw AttendanceEvent records (fallback, requires validation)
 * 
 * 2. CHECK-IN RETRIEVAL:
 *    - Day Shifts: Check-in on business date only
 *    - Night Shifts: Check-in can be on business date OR next day (late check-in)
 *    - Validation: Must fall within shift window (before shift end time)
 * 
 * 3. CHECK-OUT RETRIEVAL:
 *    - Day Shifts: Check-out on same day as check-in
 *    - Night Shifts: Check-out always on next day (after midnight)
 *    - CRITICAL: Always use LAST event, not first (actual checkout is last punch)
 *    - Validation: Must be after check-in, within reasonable time window
 * 
 * 4. VALIDATION RULES:
 *    - Check-in must belong to business date's shift
 *    - Check-out must be after check-in
 *    - Time difference must be reasonable (0-30 hours for night shifts)
 *    - Check-out must be on expected date (next day for night shifts)
 *    - Check-out time must be before shift end time (typically 6-8 AM)
 * 
 * 5. EDGE CASES HANDLED:
 *    - Late check-in for night shifts (check-in on next day)
 *    - Multiple events (intermediate punches) - use last event
 *    - Month-end and year-end date transitions
 *    - Missing check-in but existing check-out
 *    - Future check-out times (not shown until they occur)
 * 
 * 6. PREVENTION MEASURES:
 *    - Helper functions for consistent validation
 *    - Clear data source priority prevents wrong data selection
 *    - Comprehensive validation at each step
 *    - Error handling with fallbacks
 *    - Development logging for debugging
 * 
 * ============================================================================
 */

/**
 * ============================================================================
 * VALIDATION HELPERS - Future-proof validation functions
 * ============================================================================
 */

/**
 * Convert UTC Date to local date string (YYYY-MM-DD) in company timezone
 * @param {Date} utcDate - UTC Date object
 * @param {string} tzOffset - Timezone offset (e.g., "+05:00")
 * @returns {string} - Local date string in YYYY-MM-DD format
 */
function getLocalDateStr(utcDate, tzOffset) {
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
}

/**
 * Parse time string (HH:mm) to minutes since midnight
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {number} - Minutes since midnight (0-1439)
 */
function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get local time in minutes from UTC Date
 * @param {Date} utcDate - UTC Date object
 * @param {string} tzOffset - Timezone offset (e.g., "+05:00")
 * @returns {number} - Minutes since midnight in local timezone
 */
function getLocalTimeMinutes(utcDate, tzOffset) {
  const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
  const tzHours = offsetMatch ? (offsetMatch[1] === '+' ? 1 : -1) * parseInt(offsetMatch[2]) : 5;
  const localTime = new Date(utcDate.getTime() + (tzHours * 60 * 60 * 1000));
  const hour = localTime.getUTCHours();
  const min = localTime.getUTCMinutes();
  return hour * 60 + min;
}

/**
 * Validate if checkIn belongs to business date's shift
 * For night shifts: checkIn can be on business date OR next day (late check-in)
 * @param {Date} checkIn - Check-in time
 * @param {string} businessDate - Business date (YYYY-MM-DD)
 * @param {string} nextDate - Next date (YYYY-MM-DD)
 * @param {string} tzOffset - Timezone offset
 * @returns {boolean} - True if checkIn is valid for business date
 */
function isValidCheckInForBusinessDate(checkIn, businessDate, nextDate, tzOffset) {
  if (!checkIn) return false;
  const checkInDateStr = getLocalDateStr(checkIn, tzOffset);
  
  // Convert dates to comparable values
  const checkInDateParts = checkInDateStr.split('-').map(Number);
  const businessDateParts = businessDate.split('-').map(Number);
  const nextDateParts = nextDate.split('-').map(Number);
  
  const checkInDateValue = checkInDateParts[0] * 10000 + checkInDateParts[1] * 100 + checkInDateParts[2];
  const businessDateValue = businessDateParts[0] * 10000 + businessDateParts[1] * 100 + businessDateParts[2];
  const nextDateValue = nextDateParts[0] * 10000 + nextDateParts[1] * 100 + nextDateParts[2];
  
  // Allow checkIn on business date OR next day (for late check-in)
  // Reject if checkIn is before business date or more than 1 day after
  return checkInDateValue >= businessDateValue && checkInDateValue <= nextDateValue;
}

/**
 * Validate if checkout belongs to business date's shift
 * @param {Date} checkOut - Check-out time
 * @param {Date} checkIn - Check-in time
 * @param {string} businessDate - Business date (YYYY-MM-DD)
 * @param {string} nextDate - Next date (YYYY-MM-DD)
 * @param {string} tzOffset - Timezone offset
 * @param {object} shiftObj - Shift object with startTime, endTime, crossesMidnight
 * @returns {boolean} - True if checkout is valid
 */
function isValidCheckOutForShift(checkOut, checkIn, businessDate, nextDate, tzOffset, shiftObj) {
  if (!checkOut || !checkIn) return false;
  
  // Basic validation: checkout must be after checkIn
  if (checkOut <= checkIn) return false;
  
  // Validate time difference is reasonable (within 30 hours for night shifts)
  const hoursDiff = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
  if (hoursDiff < 0 || hoursDiff > 30) return false;
  
  // Validate checkIn belongs to business date
  if (!isValidCheckInForBusinessDate(checkIn, businessDate, nextDate, tzOffset)) {
    return false;
  }
  
  // For night shifts: validate checkout is on next day and within shift end time
  if (shiftObj?.crossesMidnight) {
    const checkOutDateStr = getLocalDateStr(checkOut, tzOffset);
    const checkOutTimeMin = getLocalTimeMinutes(checkOut, tzOffset);
    const shiftEndMin = parseTimeToMinutes(shiftObj.endTime);
    
    // Checkout should be on next day
    if (checkOutDateStr !== nextDate) {
      // Allow checkout on next day or later (for edge cases), but validate time
      const checkOutDateParts = checkOutDateStr.split('-').map(Number);
      const nextDateParts = nextDate.split('-').map(Number);
      const checkOutDateValue = checkOutDateParts[0] * 10000 + checkOutDateParts[1] * 100 + checkOutDateParts[2];
      const nextDateValue = nextDateParts[0] * 10000 + nextDateParts[1] * 100 + nextDateParts[2];
      
      // If checkout is on a later date, it might be invalid (too far in future)
      if (checkOutDateValue > nextDateValue) {
        return false;
      }
    }
    
    // Checkout should be before shift end time (typically 6 AM = 360 min)
    // But allow up to 8 AM (480 min) for edge cases
    if (checkOutDateStr === nextDate && checkOutTimeMin > 480) {
      return false;
    }
  }
  
  return true;
}

/**
 * ============================================================================
 * END VALIDATION HELPERS
 * ============================================================================
 */

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
    // Direct query - optimized for Vercel serverless (cache doesn't work on Vercel)
    const allShifts = await Shift.find({ isActive: true })
      .select('_id name code startTime endTime crossesMidnight gracePeriod')
      .lean()
      .maxTimeMS(2000); // Fast timeout for Vercel
    
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

    // OPTIMIZATION: Parallelize independent queries with reduced timeouts
    const [allEmployees, existingRecords, nextDayRecords] = await Promise.all([
      // OPTIMIZATION: Load employees with minimal fields
      Employee.find()
        .select('empCode name shift shiftId department designation')
        .lean()
        .maxTimeMS(2000), // Reduced timeout
      
      // Load existing ShiftAttendance records for this date
      // OPTIMIZATION: MongoDB will auto-select date index
      ShiftAttendance.find({ date: date })
        .select('date empCode checkIn checkOut shift attendanceStatus')
        .lean()
        .maxTimeMS(2000),
      
      // Load existing ShiftAttendance records for next day (for night shift checkOut)
      ShiftAttendance.find({ date: nextDateStr })
        .select('date empCode checkIn checkOut shift')
        .lean()
        .maxTimeMS(2000),
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

    // OPTIMIZATION: Fetch events with minimal fields
    // MongoDB will auto-select best index for eventTime range query
    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38, // "valid access" events only
    })
      .select('eventTime empCode') // Only select required fields
      .sort({ eventTime: 1 }) // Sort by time ascending for proper processing
      .lean()
      .maxTimeMS(4000); // Reduced timeout


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
    
    // OPTIMIZATION: Batch query with minimal fields
    // MongoDB will auto-select best index for empCode + eventTime query
    const allNextDayEvents = nightShiftEmpCodes.size > 0
      ? await AttendanceEvent.find({
          empCode: { $in: Array.from(nightShiftEmpCodes) },
          eventTime: { $gte: nextDayStartLocal, $lte: nextDayEndLocal },
          minor: 38, // "valid access" events only
        })
          .select('eventTime empCode') // Only select required fields
          .sort({ empCode: 1, eventTime: 1 })
          .lean()
          .maxTimeMS(2500) // Reduced timeout
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

      // Get employee's assigned shift to determine if it's a night shift
      // Use employee's current shift from Employee model (not from history)
      const empAssignedShift = extractShiftCode(rec?.assignedShift || emp.shift || '');
      const shiftObjForCheckOut = shiftByCode.get(empAssignedShift);
      const isNightShiftForCheckOut = shiftObjForCheckOut?.crossesMidnight === true;

      // ====================================================================================
      // CHECK-IN RETRIEVAL (handles late check-in for night shifts)
      // ====================================================================================
      // For night shifts: checkIn can occur on business date OR next day (if late)
      // Example: N2 shift starts Dec 22 9 PM, but employee checks in late on Dec 23
      // When viewing Dec 22, we need to find checkIn from Dec 23 events
      // ====================================================================================
      let checkIn = times[0] || null;
      let checkInSource = 'current_day_events'; // Track where checkIn came from
      
      // First, try current day's events
      if (!checkIn && existingRecord?.checkIn) {
        checkIn = new Date(existingRecord.checkIn);
        checkInSource = 'existing_record';
      }
      
      // For night shifts: also check next day's events for late check-in
      // This handles the case where employee checks in late (on next day) but shift started on business date
      if (isNightShiftForCheckOut && !checkIn && shiftObjForCheckOut) {
        const shiftEndMin = parseTimeToMinutes(shiftObjForCheckOut.endTime);
        
        // PRIORITY 1: Check next day's existing record (saved/correct value)
        const nextDayRecord = nextDayByEmpCode.get(emp.empCode);
        if (nextDayRecord?.checkIn) {
          const potentialCheckIn = new Date(nextDayRecord.checkIn);
          if (!isNaN(potentialCheckIn.getTime())) {
            const checkInLocalDateStr = getLocalDateStr(potentialCheckIn, TZ);
            // Validate: checkIn must be on next day and before shift end time
            if (checkInLocalDateStr === nextDateStr) {
              const checkInTimeMin = getLocalTimeMinutes(potentialCheckIn, TZ);
              if (checkInTimeMin < shiftEndMin) {
                checkIn = potentialCheckIn;
                checkInSource = 'next_day_record_late';
              }
            }
          }
        }
        
        // PRIORITY 2: Check next day's events (fallback)
        if (!checkIn) {
          const nextDayEvents = nextDayEventsByEmp.get(emp.empCode) || [];
          for (const event of nextDayEvents) {
            const eventTime = new Date(event.eventTime);
            const eventLocalDateStr = getLocalDateStr(eventTime, TZ);
            
            // Validate: event must be on next day and before shift end time
            if (eventLocalDateStr === nextDateStr) {
              const eventTimeMin = getLocalTimeMinutes(eventTime, TZ);
              if (eventTimeMin < shiftEndMin) {
                // This is a valid late check-in for the business date's shift
                checkIn = eventTime;
                checkInSource = 'next_day_events_late';
                break; // Use first valid check-in
              }
            }
          }
        }
      }
      
      // Track if checkIn is from current day's events (for validation)
      const checkInIsFromCurrentDayEvents = checkInSource === 'current_day_events';

      // ====================================================================================
      // CHECK-OUT RETRIEVAL (handles night shift checkout on next day)
      // ====================================================================================
      // For night shifts: checkOut always occurs on next day
      // For day shifts: checkOut is on same day
      // ====================================================================================
      let checkOut = null;
      
      if (times.length > 1) {
        // For night shifts: checkout is on next day, so don't use latest punch from current day's events
        // Instead, we'll get checkout from next day's events later in the code
        if (!isNightShiftForCheckOut) {
          // Day shifts: checkout is on same day, use latest punch
          checkOut = times[times.length - 1];
        }
        // For night shifts, checkOut will be set later from next day's events or existing record
      } else if (existingRecord && existingRecord.checkOut != null && !isNightShiftForCheckOut) {
        // For day shifts only: use existing checkout from current day's record
        // For night shifts: checkout is stored in next day's record, so skip current day's record
        // (We'll check next day's record later, which has the correct checkout for night shifts)
        const existingCheckOut = new Date(existingRecord.checkOut);
        if (!isNaN(existingCheckOut.getTime())) {
          checkOut = existingCheckOut;
        }
      }
      // Note: For night shifts, we skip current day's existing record checkout
      // because checkout for night shifts is stored in next day's record (correct location)
      
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
          
          // ====================================================================================
          // DATA SOURCE PRIORITY FOR NIGHT SHIFT CHECKOUT (Future-proof approach)
          // ====================================================================================
          // Priority 1: Next day's ShiftAttendance record (saved/correct value - MOST RELIABLE)
          // Priority 2: Last valid event from next day's AttendanceEvent records (fallback)
          // 
          // Why this priority?
          // - Saved records are validated and corrected by the system
          // - Events are raw data that may have intermediate punches
          // - Always use LAST event, not first (actual checkout is the last punch)
          // ====================================================================================
          
          let nextDayCheckOut = null;
          let checkOutSource = null;
          
          // PRIORITY 1: Next day's ShiftAttendance record (saved/correct value)
          const nextDayRecord = nextDayByEmpCode.get(emp.empCode);
          if (nextDayRecord && nextDayRecord.checkOut) {
            try {
              const potentialCheckOut = new Date(nextDayRecord.checkOut);
              if (!isNaN(potentialCheckOut.getTime())) {
                // Use validation helper to ensure checkout belongs to current day's shift
                if (isValidCheckOutForShift(potentialCheckOut, checkIn, date, nextDateStr, TZ, shiftObj)) {
                  nextDayCheckOut = potentialCheckOut;
                  checkOutSource = 'next_day_record';
                } else if (!checkIn) {
                  // Edge case: No checkIn but we have saved checkout - use it (from previous save)
                  // This handles cases where checkIn wasn't captured but checkout was saved
                  nextDayCheckOut = potentialCheckOut;
                  checkOutSource = 'next_day_record_no_checkin';
                }
              }
            } catch (e) {
              // Log error but continue to try other sources
              console.warn(`[daily-attendance] Error validating next day record checkout for ${emp.empCode}:`, e.message);
            }
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
              
              // PRIORITY 2: Last valid event from next day's AttendanceEvent records (fallback)
              // PERFORMANCE: Use pre-fetched next day events instead of querying per employee
              // This eliminates N+1 query problem - we already fetched all next day events above
              const nextDayEvents = nextDayEventsByEmp.get(emp.empCode) || [];
              
              if (nextDayEvents.length > 0 && checkIn) {
                const checkInTime = new Date(checkIn);
                
                // CRITICAL: Find ALL valid events, then use the LAST one (actual checkout)
                // For night shifts, there may be multiple events (intermediate punches, actual checkout)
                // Example: checkIn 20:59, events at 3:03 AM and 6:02 AM → use 6:02 AM (last one)
                let validCheckOutEvents = [];
                
                for (const event of nextDayEvents) {
                  const eventTime = new Date(event.eventTime);
                  const eventLocalDateStr = getLocalDateStr(eventTime, TZ);
                  
                  // Validate event belongs to current day's shift using helper function
                  if (eventLocalDateStr === nextDateStr && 
                      eventTime > checkInTime && 
                      isValidCheckInForBusinessDate(checkIn, date, nextDateStr, TZ)) {
                    validCheckOutEvents.push(eventTime);
                  }
                }
                
                // Use the LAST valid event as checkout (most recent = actual checkout)
                if (validCheckOutEvents.length > 0) {
                  // Sort by time and take the last one (latest = actual checkout)
                  validCheckOutEvents.sort((a, b) => a.getTime() - b.getTime());
                  const lastEvent = validCheckOutEvents[validCheckOutEvents.length - 1];
                  
                  // Final validation using helper function
                  if (isValidCheckOutForShift(lastEvent, checkIn, date, nextDateStr, TZ, shiftObj)) {
                    nextDayCheckOut = lastEvent;
                    checkOutSource = 'next_day_events_last';
                  }
                }
              }
            } catch (e) {
              // Ignore errors - will continue without checkOut
            }
          }
          
          // FINAL VALIDATION: Ensure checkout is valid before using it
          // This is a safety check even though we validated in priority steps above
          if (nextDayCheckOut && !isNaN(nextDayCheckOut.getTime())) {
            try {
              const now = new Date();
              
              // Safety check: Don't show future checkout times
              if (nextDayCheckOut > now) {
                nextDayCheckOut = null;
                checkOutSource = null;
              } else if (checkIn) {
                // Final validation using helper function (comprehensive check)
                if (isValidCheckOutForShift(nextDayCheckOut, checkIn, date, nextDateStr, TZ, shiftObj)) {
                  checkOut = nextDayCheckOut;
                  // Log source for debugging (only in development)
                  if (process.env.NODE_ENV === 'development' && checkOutSource) {
                    console.log(`[daily-attendance] Checkout for ${emp.empCode} from ${checkOutSource}: ${nextDayCheckOut.toISOString()}`);
                  }
                } else {
                  // Validation failed - don't use this checkout
                  nextDayCheckOut = null;
                  checkOutSource = null;
                }
              } else {
                // No checkIn - can't validate, but might be from previous save
                // Use it only if it's from saved record (most reliable)
                if (checkOutSource === 'next_day_record' || checkOutSource === 'next_day_record_no_checkin') {
                  checkOut = nextDayCheckOut;
                } else {
                  nextDayCheckOut = null;
                  checkOutSource = null;
                }
              }
            } catch (e) {
              // Log error but don't crash
              console.warn(`[daily-attendance] Error in final checkout validation for ${emp.empCode}:`, e.message);
              nextDayCheckOut = null;
              checkOutSource = null;
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

    // OPTIMIZATION: Use ordered: false for parallel execution, faster performance
    if (bulkOps.length > 0) {
      await ShiftAttendance.bulkWrite(bulkOps, { 
        ordered: false, // Allow parallel execution for better performance
        maxTimeMS: 5000 // Timeout for bulk operations
      });
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

