/**
 * Resolves check-in time for one employee for the business date.
 * Handles day shifts (check-in on business date) and night shifts (check-in can be on
 * business date OR next day for late check-in). Uses shared time-utils only.
 */

import { getLocalDateStr, getLocalTimeMinutes, parseTimeToMinutes } from './time-utils.js';

/**
 * Resolve check-in for an employee.
 *
 * @param {object} params
 * @param {string} params.empKey - Normalized empCode key
 * @param {Date[]} params.times - Sorted punch times for current day
 * @param {object|null} params.existingRecord - Existing ShiftAttendance for this date
 * @param {Map} params.nextDayByEmpCode - empCode -> next day ShiftAttendance record
 * @param {Map} params.nextDayEventsByEmp - empCode -> next day AttendanceEvent[]
 * @param {string} params.nextDateStr - Next day YYYY-MM-DD
 * @param {string} params.TZ - Timezone offset (e.g. "+05:00")
 * @param {object|null} params.shiftObjForCheckOut - Shift object (for night shift check)
 * @param {boolean} params.isNightShiftForCheckOut - Whether employee is on night shift
 * @returns {{ checkIn: Date|null, checkInSource: string }}
 */
export function resolveCheckIn({
  empKey,
  times,
  existingRecord,
  nextDayByEmpCode,
  nextDayEventsByEmp,
  nextDateStr,
  TZ,
  shiftObjForCheckOut,
  isNightShiftForCheckOut,
}) {
  let checkIn = times[0] || null;
  let checkInSource = 'current_day_events';

  if (!checkIn && existingRecord?.checkIn) {
    checkIn = new Date(existingRecord.checkIn);
    checkInSource = 'existing_record';
  }

  if (isNightShiftForCheckOut && !checkIn && shiftObjForCheckOut) {
    const shiftEndMin = parseTimeToMinutes(shiftObjForCheckOut.endTime);

    const nextDayRecord = nextDayByEmpCode.get(empKey);
    if (nextDayRecord?.checkIn) {
      const potentialCheckIn = new Date(nextDayRecord.checkIn);
      if (!isNaN(potentialCheckIn.getTime())) {
        const checkInLocalDateStr = getLocalDateStr(potentialCheckIn, TZ);
        if (checkInLocalDateStr === nextDateStr) {
          const checkInTimeMin = getLocalTimeMinutes(potentialCheckIn, TZ);
          if (checkInTimeMin < shiftEndMin) {
            checkIn = potentialCheckIn;
            checkInSource = 'next_day_record_late';
          }
        }
      }
    }

    if (!checkIn) {
      const nextDayEvents = nextDayEventsByEmp.get(empKey) || [];
      for (const event of nextDayEvents) {
        const eventTime = new Date(event.eventTime);
        const eventLocalDateStr = getLocalDateStr(eventTime, TZ);
        if (eventLocalDateStr === nextDateStr) {
          const eventTimeMin = getLocalTimeMinutes(eventTime, TZ);
          if (eventTimeMin < shiftEndMin) {
            checkIn = eventTime;
            checkInSource = 'next_day_events_late';
            break;
          }
        }
      }
    }
  }

  return { checkIn, checkInSource };
}
