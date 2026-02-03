/**
 * Quarter-based paid leave policy:
 * - 4 quarters per year (Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec)
 * - 6 paid leaves per quarter (no casual/annual split)
 * - If employee uses all 6 in a quarter, not eligible for more that quarter
 * - Unused leaves do NOT carry to next quarter (disposed)
 */

export const LEAVES_PER_QUARTER = 6;

/**
 * Get quarter (1–4) and year from date string YYYY-MM-DD
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {{ year: number, quarter: number }}
 */
export function getQuarterFromDate(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const month = m || 1;
  const quarter = Math.ceil(month / 3);
  return { year: y, quarter: quarter >= 1 && quarter <= 4 ? quarter : 1 };
}

const QUARTER_LABELS = {
  1: 'Jan–Mar',
  2: 'Apr–Jun',
  3: 'Jul–Sep',
  4: 'Oct–Dec',
};

/**
 * Human-readable quarter label for messages (e.g. "Q1 (Jan–Mar) 2026")
 * @param {number} year
 * @param {number} quarter - 1–4
 * @returns {string}
 */
export function getQuarterLabel(year, quarter) {
  const range = QUARTER_LABELS[quarter] || `Q${quarter}`;
  return `Q${quarter} (${range}) ${year}`;
}

/**
 * Get quarter start and end date strings (YYYY-MM-DD) for a given year and quarter
 * @param {number} year
 * @param {number} quarter - 1–4
 * @returns {{ startDate: string, endDate: string }}
 */
export function getQuarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

/**
 * Get current quarter (1–4) and year from today's date
 * @returns {{ year: number, quarter: number }}
 */
export function getCurrentQuarter() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return { year, quarter: quarter >= 1 && quarter <= 4 ? quarter : 1 };
}
