/**
 * Salary Deduction Calculation Module
 * 
 * Handles all salary deduction calculations including:
 * - Violation-based deductions (late/early)
 * - Absent/missing punch deductions
 * - Leave deductions (unpaid, sick, etc.)
 * 
 * CONFIGURATION:
 * Rules are now loaded dynamically from the database via ViolationRules model.
 * Default values are provided as fallback if rules are not found.
 */

/**
 * Default Violation Deduction Configuration (fallback)
 */
export const DEFAULT_VIOLATION_CONFIG = {
  freeViolations: 2,
  milestoneInterval: 3,
  perMinuteRate: 0.007,
  maxPerMinuteFine: 1.0,
};

/**
 * Default Absent/Missing Punch Deduction Configuration (fallback)
 */
export const DEFAULT_ABSENT_CONFIG = {
  bothMissingDays: 1.0,
  partialPunchDays: 1.0,
  leaveWithoutInformDays: 1.5,
};

/**
 * Default Leave Deduction Configuration (fallback)
 */
export const DEFAULT_LEAVE_CONFIG = {
  unpaidLeaveDays: 1.0,
  sickLeaveDays: 1.0,
  halfDayDays: 0.5,
  paidLeaveDays: 0.0,
};

/**
 * Default Salary Calculation Configuration (fallback)
 */
export const DEFAULT_SALARY_CONFIG = {
  daysPerMonth: 30,
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
 * @param {Object} violationConfig - Violation configuration from database (optional, uses defaults if not provided)
 * @returns {Object} { violationFullDays, perMinuteFineDays, totalViolationDays }
 */
export function calculateViolationDeductions(violations = [], violationConfig = null) {
  const config = violationConfig || DEFAULT_VIOLATION_CONFIG;
  let violationFullDays = 0;
  let perMinuteFineDays = 0;

  violations.forEach(({ violationNumber, violationMinutes }) => {
    const vNo = violationNumber;

    // Skip free violations (1st, 2nd, etc.)
    if (vNo <= config.freeViolations) {
      return;
    }

    // Check if this is a milestone violation (3rd, 6th, 9th, ...)
    if (vNo % config.milestoneInterval === 0) {
      // Milestone violation: Add 1 FULL DAY
      violationFullDays += 1;
    } else {
      // Regular violation: Apply per-minute fine
      const fineForThisDay = Math.min(
        violationMinutes * config.perMinuteRate,
        config.maxPerMinuteFine
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
 * @param {Object} salaryConfig - Salary configuration from database (optional, uses defaults if not provided)
 * @returns {Object} { perDaySalary, deductionAmount, netSalary }
 */
export function calculateSalaryAmounts(grossSalary, deductionDays, salaryConfig = null) {
  const config = salaryConfig || DEFAULT_SALARY_CONFIG;
  const perDaySalary =
    grossSalary > 0 ? grossSalary / config.daysPerMonth : 0;
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
 * @param {Object} leaveConfig - Leave configuration from database (optional)
 * @param {Object} absentConfig - Absent configuration from database (optional)
 * @returns {number} Deduction days for this leave type
 */
export function getLeaveDeductionDays(leaveType, leaveConfig = null, absentConfig = null) {
  const leaveCfg = leaveConfig || DEFAULT_LEAVE_CONFIG;
  const absentCfg = absentConfig || DEFAULT_ABSENT_CONFIG;
  
  switch (leaveType) {
    case 'Un Paid Leave':
      return leaveCfg.unpaidLeaveDays;
    case 'Sick Leave':
      return leaveCfg.sickLeaveDays;
    case 'Half Day':
      return leaveCfg.halfDayDays;
    case 'Paid Leave':
      return leaveCfg.paidLeaveDays;
    case 'Leave Without Inform':
      return absentCfg.leaveWithoutInformDays;
    default:
      return 0;
  }
}

/**
 * Get deduction for missing punches
 * 
 * @param {boolean} bothMissing - Both check-in and check-out missing
 * @param {boolean} partialPunch - Only one punch missing
 * @param {Object} absentConfig - Absent configuration from database (optional)
 * @returns {number} Deduction days
 */
export function getMissingPunchDeductionDays(bothMissing, partialPunch, absentConfig = null) {
  const config = absentConfig || DEFAULT_ABSENT_CONFIG;
  
  if (bothMissing) {
    return config.bothMissingDays;
  }
  if (partialPunch) {
    return config.partialPunchDays;
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

