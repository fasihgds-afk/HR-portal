/**
 * Attendance Rules Module
 * 
 * Handles status normalization and attendance rule logic.
 * This module centralizes all attendance status definitions and rules.
 * 
 * CONFIGURATION:
 * - Add/modify status types here
 * - Modify weekend/holiday rules
 * - Customize status normalization logic
 */

/**
 * Valid attendance statuses
 */
export const ATTENDANCE_STATUSES = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HOLIDAY: 'Holiday',
  SICK_LEAVE: 'Sick Leave',
  PAID_LEAVE: 'Paid Leave',
  UNPAID_LEAVE: 'Un Paid Leave',
  LEAVE_WITHOUT_INFORM: 'Leave Without Inform',
  WORK_FROM_HOME: 'Work From Home',
  HALF_DAY: 'Half Day',
};

/**
 * Normalize attendance status from various formats
 * 
 * Handles:
 * - Case variations (e.g., "present", "Present", "PRESENT")
 * - Abbreviations (e.g., "P", "SL", "PL", "UPL", "LWI", "WFH")
 * - Legacy formats
 * 
 * @param {string} rawStatus - Raw status string from database or input
 * @param {Object} options - Normalization options
 * @param {boolean} options.isWeekendOff - Whether this is a weekend/holiday
 * @returns {string} Normalized status
 */
export function normalizeStatus(rawStatus, { isWeekendOff = false } = {}) {
  let s = (rawStatus || '').trim();
  
  if (!s) {
    if (isWeekendOff) return ATTENDANCE_STATUSES.HOLIDAY;
    return ATTENDANCE_STATUSES.ABSENT;
  }

  const lower = s.toLowerCase();

  // Present
  if (lower === 'present' || lower === 'p') {
    return ATTENDANCE_STATUSES.PRESENT;
  }

  // Holiday/Off
  if (lower === 'holiday' || lower === 'h' || lower === 'off') {
    return ATTENDANCE_STATUSES.HOLIDAY;
  }

  // Absent
  if (lower === 'absent' || lower === 'a' || lower === 'no punch') {
    return ATTENDANCE_STATUSES.ABSENT;
  }

  // Sick Leave
  if (lower === 'sick leave' || lower === 'sl') {
    return ATTENDANCE_STATUSES.SICK_LEAVE;
  }

  // Paid Leave
  if (lower === 'paid leave' || lower === 'pl') {
    return ATTENDANCE_STATUSES.PAID_LEAVE;
  }

  // Unpaid Leave
  if (lower === 'un paid leave' || lower === 'unpaid leave' || lower === 'upl') {
    return ATTENDANCE_STATUSES.UNPAID_LEAVE;
  }

  // Leave Without Inform
  if (lower === 'leave without inform' || lower === 'lwi' || lower === 'leave without info') {
    return ATTENDANCE_STATUSES.LEAVE_WITHOUT_INFORM;
  }

  // Work From Home
  if (lower === 'work from home' || lower === 'wfh') {
    return ATTENDANCE_STATUSES.WORK_FROM_HOME;
  }

  // Half Day
  if (lower === 'half day' || lower === 'half') {
    return ATTENDANCE_STATUSES.HALF_DAY;
  }

  // Return as-is if no match (might be a custom status)
  return s;
}

/**
 * Check if a status represents a leave type
 * 
 * @param {string} status - Normalized status
 * @returns {boolean} True if status is a leave type
 */
export function isLeaveType(status) {
  return [
    ATTENDANCE_STATUSES.SICK_LEAVE,
    ATTENDANCE_STATUSES.PAID_LEAVE,
    ATTENDANCE_STATUSES.UNPAID_LEAVE,
    ATTENDANCE_STATUSES.LEAVE_WITHOUT_INFORM,
  ].includes(status);
}

/**
 * Check if a status should NOT have salary deduction
 * 
 * @param {string} status - Normalized status
 * @returns {boolean} True if status should not deduct salary
 */
export function isNonDeductibleStatus(status) {
  return [
    ATTENDANCE_STATUSES.HOLIDAY,
    ATTENDANCE_STATUSES.PAID_LEAVE,
    ATTENDANCE_STATUSES.WORK_FROM_HOME,
    ATTENDANCE_STATUSES.PRESENT, // Present with no violations = no deduction
  ].includes(status);
}

/**
 * Check if a status represents an absent day
 * 
 * @param {string} status - Normalized status
 * @returns {boolean} True if status represents absence
 */
export function isAbsentStatus(status) {
  return [
    ATTENDANCE_STATUSES.ABSENT,
    ATTENDANCE_STATUSES.LEAVE_WITHOUT_INFORM,
  ].includes(status);
}

/**
 * Extract shift code from formatted string
 * 
 * Handles cases like:
 * - "D1" → "D1"
 * - "– S2 (21:00–06:00)" → "S2"
 * - "S2 (21:00–06:00)" → "S2"
 * 
 * @param {string} shiftStr - Shift string (can be code or formatted)
 * @returns {string} Extracted shift code
 */
export function extractShiftCode(shiftStr) {
  if (!shiftStr || typeof shiftStr !== 'string') {
    return shiftStr || '';
  }

  shiftStr = shiftStr.trim();

  // If it's already a simple code like "D1", "S2", etc., return it
  if (/^[A-Z]\d+$/.test(shiftStr)) {
    return shiftStr;
  }

  // Try to extract code from formatted strings like "– S2 (21:00–06:00)" or "S2 (21:00–06:00)"
  const match = shiftStr.match(/(?:–\s*)?([A-Z]\d+)(?:\s*\([^)]+\))?/);
  if (match && match[1]) {
    return match[1];
  }

  // If no pattern matches, return as-is
  return shiftStr;
}

/**
 * Get status short code for display
 * 
 * @param {string} status - Normalized status
 * @returns {string} Short code (e.g., "P", "A", "SL")
 */
export function getStatusShortCode(status) {
  if (!status) return '-';

  switch (status) {
    case ATTENDANCE_STATUSES.PRESENT:
      return 'P';
    case ATTENDANCE_STATUSES.HOLIDAY:
      return 'H';
    case ATTENDANCE_STATUSES.ABSENT:
      return 'A';
    case ATTENDANCE_STATUSES.SICK_LEAVE:
      return 'SL';
    case ATTENDANCE_STATUSES.PAID_LEAVE:
      return 'PL';
    case ATTENDANCE_STATUSES.UNPAID_LEAVE:
      return 'UPL';
    case ATTENDANCE_STATUSES.LEAVE_WITHOUT_INFORM:
      return 'LWI';
    case ATTENDANCE_STATUSES.WORK_FROM_HOME:
      return 'WFH';
    case ATTENDANCE_STATUSES.HALF_DAY:
      return 'Half';
    default:
      return status;
  }
}

