/**
 * Validation helpers for daily attendance check-in/check-out.
 * Uses shared time-utils for date/time; no duplicate helper definitions.
 */

import { getLocalDateStr, getLocalTimeMinutes, parseTimeToMinutes } from './time-utils.js';

/**
 * Validate if checkIn belongs to business date's shift.
 * For night shifts: checkIn can be on business date OR next day (late check-in).
 *
 * @param {Date} checkIn - Check-in time
 * @param {string} businessDate - Business date (YYYY-MM-DD)
 * @param {string} nextDate - Next date (YYYY-MM-DD)
 * @param {string} tzOffset - Timezone offset
 * @returns {boolean} - True if checkIn is valid for business date
 */
export function isValidCheckInForBusinessDate(checkIn, businessDate, nextDate, tzOffset) {
  if (!checkIn) return false;
  const checkInDateStr = getLocalDateStr(checkIn, tzOffset);

  const checkInDateParts = checkInDateStr.split('-').map(Number);
  const businessDateParts = businessDate.split('-').map(Number);
  const nextDateParts = nextDate.split('-').map(Number);

  const checkInDateValue = checkInDateParts[0] * 10000 + checkInDateParts[1] * 100 + checkInDateParts[2];
  const businessDateValue = businessDateParts[0] * 10000 + businessDateParts[1] * 100 + businessDateParts[2];
  const nextDateValue = nextDateParts[0] * 10000 + nextDateParts[1] * 100 + nextDateParts[2];

  return checkInDateValue >= businessDateValue && checkInDateValue <= nextDateValue;
}

/**
 * Validate if checkout belongs to business date's shift.
 *
 * @param {Date} checkOut - Check-out time
 * @param {Date} checkIn - Check-in time
 * @param {string} businessDate - Business date (YYYY-MM-DD)
 * @param {string} nextDate - Next date (YYYY-MM-DD)
 * @param {string} tzOffset - Timezone offset
 * @param {object} shiftObj - Shift object with startTime, endTime, crossesMidnight
 * @returns {boolean} - True if checkout is valid
 */
export function isValidCheckOutForShift(checkOut, checkIn, businessDate, nextDate, tzOffset, shiftObj) {
  if (!checkOut || !checkIn) return false;

  if (checkOut <= checkIn) return false;

  const hoursDiff = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
  if (hoursDiff < 0 || hoursDiff > 30) return false;

  if (!isValidCheckInForBusinessDate(checkIn, businessDate, nextDate, tzOffset)) {
    return false;
  }

  if (shiftObj?.crossesMidnight) {
    const checkOutDateStr = getLocalDateStr(checkOut, tzOffset);
    const checkOutTimeMin = getLocalTimeMinutes(checkOut, tzOffset);
    const shiftEndMin = parseTimeToMinutes(shiftObj.endTime);

    if (checkOutDateStr !== nextDate) {
      const checkOutDateParts = checkOutDateStr.split('-').map(Number);
      const nextDateParts = nextDate.split('-').map(Number);
      const checkOutDateValue = checkOutDateParts[0] * 10000 + checkOutDateParts[1] * 100 + checkOutDateParts[2];
      const nextDateValue = nextDateParts[0] * 10000 + nextDateParts[1] * 100 + nextDateParts[2];
      if (checkOutDateValue > nextDateValue) {
        return false;
      }
    }

    if (checkOutDateStr === nextDate && checkOutTimeMin > 480) {
      return false;
    }
  }

  return true;
}
