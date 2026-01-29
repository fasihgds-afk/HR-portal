/**
 * Shared date/time utilities for daily attendance.
 * Single source for getLocalDateStr, parseTimeToMinutes, getLocalTimeMinutes,
 * getNextDateStr, and classifyByTime to avoid duplication and reduce bug risk.
 */

/**
 * Convert UTC Date to local date string (YYYY-MM-DD) in company timezone.
 * @param {Date} utcDate - UTC Date object
 * @param {string} tzOffset - Timezone offset (e.g., "+05:00")
 * @returns {string} - Local date string in YYYY-MM-DD format
 */
export function getLocalDateStr(utcDate, tzOffset) {
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
 * Parse time string (HH:mm) to minutes since midnight.
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {number} - Minutes since midnight (0-1439)
 */
export function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get local time in minutes from UTC Date.
 * @param {Date} utcDate - UTC Date object
 * @param {string} tzOffset - Timezone offset (e.g., "+05:00")
 * @returns {number} - Minutes since midnight in local timezone
 */
export function getLocalTimeMinutes(utcDate, tzOffset) {
  const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
  const tzHours = offsetMatch ? (offsetMatch[1] === '+' ? 1 : -1) * parseInt(offsetMatch[2]) : 5;
  const localTime = new Date(utcDate.getTime() + (tzHours * 60 * 60 * 1000));
  const hour = localTime.getUTCHours();
  const min = localTime.getUTCMinutes();
  return hour * 60 + min;
}

/**
 * Get next calendar date string (YYYY-MM-DD) from a date string.
 * @param {string} date - Business date YYYY-MM-DD
 * @returns {string} - Next day YYYY-MM-DD
 */
export function getNextDateStr(date) {
  const [year, month, day] = date.split('-').map(Number);
  const currentDateObj = new Date(Date.UTC(year, month - 1, day));
  const nextDateObj = new Date(currentDateObj);
  nextDateObj.setUTCDate(nextDateObj.getUTCDate() + 1);
  return (
    nextDateObj.getUTCFullYear() +
    '-' +
    String(nextDateObj.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(nextDateObj.getUTCDate()).padStart(2, '0')
  );
}

/**
 * Classify a punch time to a shift code using dynamic shifts from database.
 * Sync service stores eventTime with timezone from TIMEZONE_OFFSET; comparisons use local time.
 *
 * @param {Date} localDate - Punch time (Date from MongoDB)
 * @param {string} businessDateStr - Business date YYYY-MM-DD
 * @param {string} tzOffset - Timezone offset (e.g., "+05:00")
 * @param {Array} shifts - Array of shift objects from database
 * @returns {string|null} - Shift code or null if no match
 */
export function classifyByTime(localDate, businessDateStr, tzOffset, shifts) {
  if (!shifts || shifts.length === 0) return null;

  const businessStartLocal = new Date(`${businessDateStr}T00:00:00${tzOffset}`);
  const nextDayLocal = new Date(businessStartLocal);
  nextDayLocal.setDate(nextDayLocal.getDate() + 1);

  const localDateStr = localDate.toISOString().slice(0, 10);
  const nextDayStr = nextDayLocal.toISOString().slice(0, 10);

  const h = localDate.getHours();
  const m = localDate.getMinutes();
  const punchMinutes = h * 60 + m;

  for (const shift of shifts) {
    if (!shift.isActive) continue;

    const startMin = parseTimeToMinutes(shift.startTime);
    let endMin = parseTimeToMinutes(shift.endTime);

    if (shift.crossesMidnight) {
      endMin += 24 * 60;
    }

    if (shift.crossesMidnight) {
      const isOnStartDay = localDateStr === businessDateStr && punchMinutes >= startMin;
      const isOnEndDay = localDateStr === nextDayStr && punchMinutes < (endMin % (24 * 60));
      if (isOnStartDay || isOnEndDay) {
        return shift.code;
      }
    } else {
      if (localDateStr === businessDateStr && punchMinutes >= startMin && punchMinutes < endMin) {
        return shift.code;
      }
    }
  }

  return null;
}
