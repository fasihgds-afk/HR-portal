/**
 * Salary Deduction Calculation Module
 * 
 * Handles all salary deduction calculations including:
 * - Violation-based deductions (late/early)
 * - Absent/missing punch deductions
 * - Leave deductions (unpaid, sick, etc.)
 * 
 * CONFIGURATION:
 * Modify the formulas below to change deduction policies.
 * All values can be adjusted via configuration or environment variables.
 */

/**
 * Violation Deduction Configuration
 */
export const VIOLATION_CONFIG = {
  // Number of free violations before deductions start
  FREE_VIOLATIONS: 2,
  
  // Milestone violation pattern (every Nth violation = full day)
  MILESTONE_INTERVAL: 3, // 3rd, 6th, 9th, 12th, ...
  
  // Per-minute fine rate (days per minute of violation)
  PER_MINUTE_RATE: 0.007, // 0.007 days per minute
  
  // Maximum per-minute fine per violation (cap at 1 day)
  MAX_PER_MINUTE_FINE: 1.0,
};

/**
 * Absent/Missing Punch Deduction Configuration
 */
export const ABSENT_CONFIG = {
  // Both punches missing = X days deduction
  BOTH_MISSING_DAYS: 1.0,
  
  // Only one punch missing = X days deduction
  PARTIAL_PUNCH_DAYS: 1.0,
  
  // Leave Without Inform = X days deduction
  LEAVE_WITHOUT_INFORM_DAYS: 1.5,
};

/**
 * Leave Deduction Configuration
 */
export const LEAVE_CONFIG = {
  // Unpaid Leave = X days deduction per occurrence
  UNPAID_LEAVE_DAYS: 1.0,
  
  // Sick Leave = X days deduction per occurrence
  SICK_LEAVE_DAYS: 1.0,
  
  // Half Day = X days deduction per occurrence
  HALF_DAY_DAYS: 0.5,
  
  // Paid Leave = X days deduction (usually 0)
  PAID_LEAVE_DAYS: 0.0,
};

/**
 * Salary Calculation Configuration
 */
export const SALARY_CONFIG = {
  // Days per month for salary calculation (can be 26, 30, 31)
  DAYS_PER_MONTH: 30,
};

/**
 * Calculate violation-based deductions
 * 
 * Formula:
 * - 1st & 2nd violations: FREE (no deduction)
 * - 3rd, 6th, 9th, ... violations: 1 FULL DAY each
 * - 4th, 5th, 7th, 8th, 10th, 11th, ... violations: PER-MINUTE FINE
 * 
 * @param {Array} violations - Array of { violationNumber, violationMinutes }
 * @returns {Object} { violationFullDays, perMinuteFineDays, totalViolationDays }
 */
export function calculateViolationDeductions(violations = []) {
  let violationFullDays = 0;
  let perMinuteFineDays = 0;

  violations.forEach(({ violationNumber, violationMinutes }) => {
    const vNo = violationNumber;

    // Skip free violations (1st, 2nd)
    if (vNo <= VIOLATION_CONFIG.FREE_VIOLATIONS) {
      return;
    }

    // Check if this is a milestone violation (3rd, 6th, 9th, ...)
    if (vNo % VIOLATION_CONFIG.MILESTONE_INTERVAL === 0) {
      // Milestone violation: Add 1 FULL DAY
      violationFullDays += 1;
    } else {
      // Regular violation: Apply per-minute fine
      const fineForThisDay = Math.min(
        violationMinutes * VIOLATION_CONFIG.PER_MINUTE_RATE,
        VIOLATION_CONFIG.MAX_PER_MINUTE_FINE
      );
      perMinuteFineDays += fineForThisDay;
    }
  });

  const totalViolationDays = violationFullDays + perMinuteFineDays;

  return {
    violationFullDays,
    perMinuteFineDays,
    totalViolationDays: Number(totalViolationDays.toFixed(3)),
  };
}

/**
 * Calculate total salary deduction days
 * 
 * @param {Object} params - Deduction parameters
 * @param {number} params.violationFullDays - Full days from milestone violations
 * @param {number} params.perMinuteFineDays - Days from per-minute fines
 * @param {number} params.unpaidLeaveDays - Unpaid leave days
 * @param {number} params.absentDays - Absent/missing punch days
 * @param {number} params.halfDays - Half day leaves
 * @returns {number} Total deduction days (rounded to 3 decimals)
 */
export function calculateTotalDeductionDays({
  violationFullDays = 0,
  perMinuteFineDays = 0,
  unpaidLeaveDays = 0,
  absentDays = 0,
  halfDays = 0,
}) {
  const totalDays =
    violationFullDays +
    perMinuteFineDays +
    unpaidLeaveDays +
    absentDays +
    halfDays;

  return Number(totalDays.toFixed(3));
}

/**
 * Calculate salary amounts
 * 
 * @param {number} grossSalary - Gross monthly salary
 * @param {number} deductionDays - Total deduction days
 * @returns {Object} { perDaySalary, deductionAmount, netSalary }
 */
export function calculateSalaryAmounts(grossSalary, deductionDays) {
  const perDaySalary =
    grossSalary > 0 ? grossSalary / SALARY_CONFIG.DAYS_PER_MONTH : 0;
  const deductionAmount = perDaySalary * deductionDays;
  const netSalary = grossSalary - deductionAmount;

  return {
    perDaySalary: Number(perDaySalary.toFixed(2)),
    deductionAmount: Number(deductionAmount.toFixed(2)),
    netSalary: Number(netSalary.toFixed(2)),
  };
}

/**
 * Get deduction configuration for a specific leave type
 * 
 * @param {string} leaveType - Leave type (e.g., 'Un Paid Leave', 'Sick Leave', etc.)
 * @returns {number} Deduction days for this leave type
 */
export function getLeaveDeductionDays(leaveType) {
  switch (leaveType) {
    case 'Un Paid Leave':
      return LEAVE_CONFIG.UNPAID_LEAVE_DAYS;
    case 'Sick Leave':
      return LEAVE_CONFIG.SICK_LEAVE_DAYS;
    case 'Half Day':
      return LEAVE_CONFIG.HALF_DAY_DAYS;
    case 'Paid Leave':
      return LEAVE_CONFIG.PAID_LEAVE_DAYS;
    case 'Leave Without Inform':
      return ABSENT_CONFIG.LEAVE_WITHOUT_INFORM_DAYS;
    default:
      return 0;
  }
}

/**
 * Get deduction for missing punches
 * 
 * @param {boolean} bothMissing - Both check-in and check-out missing
 * @param {boolean} partialPunch - Only one punch missing
 * @returns {number} Deduction days
 */
export function getMissingPunchDeductionDays(bothMissing, partialPunch) {
  if (bothMissing) {
    return ABSENT_CONFIG.BOTH_MISSING_DAYS;
  }
  if (partialPunch) {
    return ABSENT_CONFIG.PARTIAL_PUNCH_DAYS;
  }
  return 0;
}

/**
 * EXAMPLE USAGE:
 * 
 * // Calculate violations
 * const violations = [
 *   { violationNumber: 1, violationMinutes: 15 }, // FREE
 *   { violationNumber: 2, violationMinutes: 20 }, // FREE
 *   { violationNumber: 3, violationMinutes: 10 }, // 1 FULL DAY
 *   { violationNumber: 4, violationMinutes: 30 }, // 30 * 0.007 = 0.21 days
 *   { violationNumber: 5, violationMinutes: 45 }, // 45 * 0.007 = 0.315 days
 * ];
 * 
 * const { violationFullDays, perMinuteFineDays, totalViolationDays } = 
 *   calculateViolationDeductions(violations);
 * // Result: violationFullDays = 1, perMinuteFineDays = 0.525, totalViolationDays = 1.525
 * 
 * // Calculate total deduction
 * const totalDays = calculateTotalDeductionDays({
 *   violationFullDays: 1,
 *   perMinuteFineDays: 0.525,
 *   unpaidLeaveDays: 2,
 *   absentDays: 1.5,
 *   halfDays: 0.5,
 * });
 * // Result: 5.525 days
 * 
 * // Calculate salary
 * const { perDaySalary, deductionAmount, netSalary } = 
 *   calculateSalaryAmounts(30000, 5.525);
 * // Result: perDaySalary = 1000, deductionAmount = 5525, netSalary = 24475
 */

