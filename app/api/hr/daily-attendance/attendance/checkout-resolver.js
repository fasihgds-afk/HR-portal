/**
 * Resolves check-out time for one employee for the business date.
 * Day shifts: check-out on same day. Night shifts: check-out on next day;
 * uses next day ShiftAttendance record or pre-fetched next day events, with validation.
 */

import { getLocalDateStr } from './time-utils.js';
import { isValidCheckInForBusinessDate, isValidCheckOutForShift } from './validation.js';

/**
 * Resolve check-out for an employee.
 *
 * @param {object} params
 * @param {string} params.empKey - Normalized empCode key
 * @param {object} params.emp - Employee document (for logging)
 * @param {Date[]} params.times - Sorted punch times for current day
 * @param {Date|null} params.checkIn - Resolved check-in time
 * @param {object|null} params.existingRecord - Existing ShiftAttendance for this date
 * @param {Map} params.nextDayByEmpCode - empCode -> next day ShiftAttendance record
 * @param {Map} params.nextDayEventsByEmp - empCode -> next day AttendanceEvent[]
 * @param {string} params.date - Business date YYYY-MM-DD
 * @param {string} params.nextDateStr - Next day YYYY-MM-DD
 * @param {string} params.TZ - Timezone offset (e.g. "+05:00")
 * @param {Map} params.shiftByCode - Shift code -> shift object
 * @param {string} params.empAssignedShift - Resolved shift code for employee
 * @param {boolean} params.isNightShiftForCheckOut - Whether employee is on night shift
 * @returns {Date|null} - Resolved check-out or null
 */
export function resolveCheckOut({
  empKey,
  emp,
  times,
  checkIn,
  existingRecord,
  nextDayByEmpCode,
  nextDayEventsByEmp,
  date,
  nextDateStr,
  TZ,
  shiftByCode,
  empAssignedShift,
  isNightShiftForCheckOut,
}) {
  let checkOut = null;

  if (times.length > 1) {
    if (!isNightShiftForCheckOut) {
      checkOut = times[times.length - 1];
    }
  } else if (existingRecord && existingRecord.checkOut != null && !isNightShiftForCheckOut) {
    const existingCheckOut = new Date(existingRecord.checkOut);
    if (!isNaN(existingCheckOut.getTime())) {
      checkOut = existingCheckOut;
    }
  }

  if (!checkOut && checkIn) {
    const shiftObj = shiftByCode.get(empAssignedShift);
    const isNightShift = shiftObj?.crossesMidnight === true;

    if (isNightShift) {
      let nextDayCheckOut = null;
      let checkOutSource = null;

      const nextDayRecord = nextDayByEmpCode.get(empKey);
      if (nextDayRecord && nextDayRecord.checkOut) {
        try {
          const potentialCheckOut = new Date(nextDayRecord.checkOut);
          if (!isNaN(potentialCheckOut.getTime())) {
            if (isValidCheckOutForShift(potentialCheckOut, checkIn, date, nextDateStr, TZ, shiftObj)) {
              nextDayCheckOut = potentialCheckOut;
              checkOutSource = 'next_day_record';
            } else if (!checkIn) {
              nextDayCheckOut = potentialCheckOut;
              checkOutSource = 'next_day_record_no_checkin';
            }
          }
        } catch (e) {
          console.warn(`[daily-attendance] Error validating next day record checkout for ${emp.empCode}:`, e.message);
        }
      }

      if (!nextDayCheckOut && checkIn) {
        try {
          const nextDayEvents = nextDayEventsByEmp.get(empKey) || [];
          if (nextDayEvents.length > 0 && checkIn) {
            const checkInTime = new Date(checkIn);
            const validCheckOutEvents = [];

            for (const event of nextDayEvents) {
              const eventTime = new Date(event.eventTime);
              const eventLocalDateStr = getLocalDateStr(eventTime, TZ);
              if (
                eventLocalDateStr === nextDateStr &&
                eventTime > checkInTime &&
                isValidCheckInForBusinessDate(checkIn, date, nextDateStr, TZ)
              ) {
                validCheckOutEvents.push(eventTime);
              }
            }

            if (validCheckOutEvents.length > 0) {
              validCheckOutEvents.sort((a, b) => a.getTime() - b.getTime());
              const lastEvent = validCheckOutEvents[validCheckOutEvents.length - 1];
              if (isValidCheckOutForShift(lastEvent, checkIn, date, nextDateStr, TZ, shiftObj)) {
                nextDayCheckOut = lastEvent;
                checkOutSource = 'next_day_events_last';
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (nextDayCheckOut && !isNaN(nextDayCheckOut.getTime())) {
        try {
          const now = new Date();
          if (nextDayCheckOut > now) {
            nextDayCheckOut = null;
            checkOutSource = null;
          } else if (checkIn) {
            if (isValidCheckOutForShift(nextDayCheckOut, checkIn, date, nextDateStr, TZ, shiftObj)) {
              checkOut = nextDayCheckOut;
              if (process.env.NODE_ENV === 'development' && checkOutSource) {
                console.log(`[daily-attendance] Checkout for ${emp.empCode} from ${checkOutSource}: ${nextDayCheckOut.toISOString()}`);
              }
            } else {
              nextDayCheckOut = null;
              checkOutSource = null;
            }
          } else {
            if (checkOutSource === 'next_day_record' || checkOutSource === 'next_day_record_no_checkin') {
              checkOut = nextDayCheckOut;
            } else {
              nextDayCheckOut = null;
              checkOutSource = null;
            }
          }
        } catch (e) {
          console.warn(`[daily-attendance] Error in final checkout validation for ${emp.empCode}:`, e.message);
          nextDayCheckOut = null;
          checkOutSource = null;
        }
      }
    }
  }

  return checkOut;
}
