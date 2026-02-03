// app/api/employee/leaves/route.js
// Quarter-based paid leave; limit per quarter from LeavePolicy (configurable from HR frontend)
import { connectDB } from '../../../../lib/db';
import LeaveRecord from '../../../../models/LeaveRecord';
import { getQuarterFromDate, getQuarterRange, getCurrentQuarter } from '../../../../lib/leave/quarterUtils';
import { getLeavePolicy } from '../../../../lib/leave/getLeavePolicy';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/employee/leaves?empCode=XXX&year=YYYY - Balance by quarter (current quarter + full year optional)
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    const policy = await getLeavePolicy();
    const leavesPerQuarter = policy.leavesPerQuarter;

    const { year: currentYear, quarter: currentQuarter } = getCurrentQuarter();

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const leaveRecords = await LeaveRecord.find({
      empCode,
      date: { $gte: yearStart, $lte: yearEnd },
      leaveType: 'paid',
    })
      .select('date reason')
      .sort({ date: -1 })
      .lean()
      .maxTimeMS(2000);

    const countByQuarter = { 1: 0, 2: 0, 3: 0, 4: 0 };
    leaveRecords.forEach((lr) => {
      const { quarter } = getQuarterFromDate(lr.date);
      if (countByQuarter[quarter] !== undefined) countByQuarter[quarter] += 1;
    });

    const quarters = [1, 2, 3, 4].map((q) => ({
      quarter: q,
      allocated: leavesPerQuarter,
      taken: countByQuarter[q] || 0,
      remaining: Math.max(0, leavesPerQuarter - (countByQuarter[q] || 0)),
      ...getQuarterRange(year, q),
    }));

    const currentQuarterData = year === currentYear ? quarters[currentQuarter - 1] : null;

    const summary = {
      leavesPerQuarter,
      currentQuarter: currentQuarterData
        ? {
            quarter: currentQuarter,
            year: currentYear,
            taken: currentQuarterData.taken,
            remaining: currentQuarterData.remaining,
            allocated: leavesPerQuarter,
          }
        : null,
      quarters,
      history: leaveRecords,
    };

    return successResponse(
      { empCode, year, summary },
      'Leave balance retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
