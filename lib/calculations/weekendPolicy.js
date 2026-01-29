/**
 * Weekend / Saturday policy helpers.
 *
 * Supports:
 * - Department policy: 'all_off' (every Saturday off) or 'alternate' (1st/3rd vs 2nd/4th by employee group).
 * - Employee saturdayGroup: 'A' = off 1st & 3rd Saturday; 'B' = off 2nd & 4th Saturday.
 *   When policy is 'alternate', 5th Saturday is treated as working for both groups.
 *
 * @param {number} saturdayIndex - Which Saturday of the month (1..5).
 * @param {{ saturdayGroup?: string }} employee - Must have saturdayGroup 'A' or 'B' when policy is 'alternate'.
 * @param {Map<string, string>} departmentPolicyMap - Map of department name → 'all_off' | 'alternate'.
 * @param {string} [departmentName] - Employee's department name (optional; if missing, 'alternate' is assumed).
 * @returns {boolean} - True if this Saturday is off for this employee.
 */
export function isSaturdayOffForEmployee(saturdayIndex, employee, departmentPolicyMap, departmentName = '') {
  const policy = (departmentPolicyMap && departmentPolicyMap.get(departmentName)) || 'alternate';

  if (policy === 'all_off') {
    return true;
  }

  // policy === 'alternate': use employee's saturdayGroup
  // A → off 1st & 3rd Saturday (saturdayIndex 1, 3)
  // B → off 2nd & 4th Saturday (saturdayIndex 2, 4)
  // 5th Saturday (saturdayIndex 5) → working for both
  const group = (employee && employee.saturdayGroup) || 'A';
  if (group === 'A') {
    return saturdayIndex === 1 || saturdayIndex === 3;
  }
  if (group === 'B') {
    return saturdayIndex === 2 || saturdayIndex === 4;
  }
  return saturdayIndex === 1 || saturdayIndex === 3; // default like A
}

/**
 * Get which Saturday of the month a date is (1..5), in company timezone.
 * Use when you already know the date is a Saturday (dow === 6).
 *
 * @param {number} year - Full year
 * @param {number} monthIndex - Month 0-11
 * @param {number} dayOfMonth - Day of month (1-31)
 * @param {number} dowOfDay - Day of week for this day (0-6, 6 = Saturday)
 * @param {number} dowOfFirstDayOfMonth - Day of week for 1st of month (0-6)
 * @returns {number|null} - 1..5 for 1st–5th Saturday, or null if not Saturday
 */
export function getSaturdayIndexInMonth(year, monthIndex, dayOfMonth, dowOfDay, dowOfFirstDayOfMonth) {
  if (dowOfDay !== 6) return null;
  const firstSatDay = 1 + (6 - dowOfFirstDayOfMonth + 7) % 7;
  return 1 + Math.floor((dayOfMonth - firstSatDay) / 7);
}
