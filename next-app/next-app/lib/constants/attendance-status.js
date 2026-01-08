/**
 * Attendance Status Constants
 * 
 * Centralized definitions of all attendance status values used throughout the application
 */

export const ATTENDANCE_STATUS = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  PAID_LEAVE: 'Paid Leave',
  UNPAID_LEAVE: 'Un Paid Leave',
  SICK_LEAVE: 'Sick Leave',
  HALF_DAY: 'Half Day',
  HOLIDAY: 'Holiday',
  WORK_FROM_HOME: 'Work From Home',
  LEAVE_WITHOUT_INFORM: 'Leave Without Inform',
};

Object.freeze(ATTENDANCE_STATUS);

/**
 * Status categories for filtering/grouping
 */
export const STATUS_CATEGORIES = {
  PRESENT: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.WORK_FROM_HOME],
  LEAVE: [
    ATTENDANCE_STATUS.LEAVE,
    ATTENDANCE_STATUS.PAID_LEAVE,
    ATTENDANCE_STATUS.UNPAID_LEAVE,
    ATTENDANCE_STATUS.SICK_LEAVE,
    ATTENDANCE_STATUS.LEAVE_WITHOUT_INFORM,
  ],
  ABSENT: [ATTENDANCE_STATUS.ABSENT],
  HOLIDAY: [ATTENDANCE_STATUS.HOLIDAY],
  HALF_DAY: [ATTENDANCE_STATUS.HALF_DAY],
};

Object.freeze(STATUS_CATEGORIES);

/**
 * Check if a status is considered a leave type
 */
export function isLeaveStatus(status) {
  return STATUS_CATEGORIES.LEAVE.includes(status);
}

/**
 * Check if a status affects salary
 */
export function affectsSalary(status) {
  return [
    ATTENDANCE_STATUS.ABSENT,
    ATTENDANCE_STATUS.UNPAID_LEAVE,
    ATTENDANCE_STATUS.LEAVE_WITHOUT_INFORM,
    ATTENDANCE_STATUS.HALF_DAY,
  ].includes(status);
}

