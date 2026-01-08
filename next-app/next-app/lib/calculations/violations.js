/**
 * Violation Calculation Module
 * 
 * Handles calculation of late/early violations based on shift timing and grace periods.
 * This module is extracted from the monthly-attendance route for easy modification.
 * 
 * CONFIGURATION:
 * - Modify grace periods, violation rules, and fine rates here
 * - All time calculations are in company timezone (from TIMEZONE_OFFSET env)
 */

const COMPANY_OFFSET_MS = process.env.TIMEZONE_OFFSET === '+05:00' 
  ? 5 * 60 * 60 * 1000 
  : 0;

/**
 * Convert hours and minutes to total minutes since midnight
 */
function toMinutes(h, m) {
  return h * 60 + m;
}

/**
 * Convert a Date (UTC internally) to minutes since midnight in COMPANY LOCAL time
 */
function toCompanyMinutes(date) {
  const localMs = date.getTime() + COMPANY_OFFSET_MS;
  const local = new Date(localMs);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return toMinutes(h, m);
}

/**
 * Check if a date is Saturday in company timezone
 */
function isCompanySaturday(date) {
  const localMs = date.getTime() + COMPANY_OFFSET_MS;
  const local = new Date(localMs);
  return local.getUTCDay() === 6; // Saturday
}

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
function parseTimeToMinutes(timeStr) {
  const [h, m] = (timeStr || '').split(':').map(Number);
  return toMinutes(h || 0, m || 0);
}

/**
 * Calculate late/early violations for a day
 * 
 * @param {Object|String} shift - Shift object (with startTime, endTime, gracePeriod) or shift code string
 * @param {Date} checkIn - Check-in time
 * @param {Date} checkOut - Check-out time
 * @param {Map} allShiftsMap - Map of all shifts (for lookup by code)
 * @returns {Object} { late, earlyLeave, lateMinutes, earlyMinutes }
 */
export function computeLateEarly(shift, checkIn, checkOut, allShiftsMap = null) {
  if (!shift || !checkIn || !checkOut) {
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // Convert both punches into company-local minutes
  let inMin = toCompanyMinutes(checkIn);
  let outMin = toCompanyMinutes(checkOut);

  let startMin = 0;
  let endMin = 0;
  let rawEndMin = 0;
  let gracePeriod = 15; // Default grace period (can be configured per shift)
  let crossesMidnight = false;

  // Get shift object - could be already an object or a code string
  let shiftObj = null;
  if (typeof shift === 'object' && shift.startTime) {
    shiftObj = shift;
  } else if (typeof shift === 'string' && allShiftsMap) {
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
  } else {
    // Fallback: if no shift object, return no violations
    return { late: false, earlyLeave: false, lateMinutes: 0, earlyMinutes: 0 };
  }

  // Handle night shifts that cross midnight
  if (crossesMidnight) {
    // Normalize end time: add 24 hours for next day
    endMin = rawEndMin + 24 * 60;

    // Normalize check-out time if it's in early morning (next day)
    const maxCheckOutWindow = 8 * 60; // 08:00 = 480 minutes
    if (outMin < maxCheckOutWindow) {
      outMin += 24 * 60;
    }
  } else {
    endMin = rawEndMin;
  }

  // Calculate late: how many minutes after shift start
  // POLICY:
  // - Check-in BEFORE shift start → GREEN (not late)
  // - Check-in AT or AFTER shift start, but within grace period → GREEN (on-time)
  // - Check-in AFTER shift start + grace period → AMBER (violation)
  let lateMinutesTotal = inMin - startMin;
  if (lateMinutesTotal < 0) lateMinutesTotal = 0; // Early arrival = not late

  // Calculate early: how many minutes before shift end
  // POLICY:
  // - Check-out AT or AFTER shift end → GREEN (stayed late is fine)
  // - Check-out BEFORE shift end, but within grace period → GREEN (on-time)
  // - Check-out BEFORE shift end - grace period → ORANGE (violation)
  let earlyMinutesTotal = endMin - outMin;
  if (earlyMinutesTotal < 0) earlyMinutesTotal = 0; // Late departure = not early

  // Determine violations: only if minutes exceed grace period
  const late = lateMinutesTotal > gracePeriod;
  const earlyLeave = earlyMinutesTotal > gracePeriod;

  // Violation minutes = minutes AFTER grace period
  const lateMinutes = late ? lateMinutesTotal - gracePeriod : 0;
  const earlyMinutes = earlyLeave ? earlyMinutesTotal - gracePeriod : 0;

  return { late, earlyLeave, lateMinutes, earlyMinutes };
}

/**
 * Configuration: Default grace period (minutes)
 * Override this or set per shift in database
 */
export const DEFAULT_GRACE_PERIOD = 15;

