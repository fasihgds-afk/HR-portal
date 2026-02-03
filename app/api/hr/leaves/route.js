// app/api/hr/leaves/route.js
// Quarter-based paid leave; limit per quarter from LeavePolicy (configurable from HR frontend)
import { connectDB } from '../../../../lib/db';
import PaidLeaveQuarter from '../../../../models/PaidLeaveQuarter';
import LeaveRecord from '../../../../models/LeaveRecord';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Employee from '../../../../models/Employee';
import { getQuarterFromDate, getQuarterLabel } from '../../../../lib/leave/quarterUtils';
import { getLeavePolicy } from '../../../../lib/leave/getLeavePolicy';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/hr/leaves?year=YYYY&empCode=XXX - List leave status by quarter for the year
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
    const empCodeFilter = (searchParams.get('empCode') || '').trim();

    const employeeQuery = empCodeFilter ? { empCode: empCodeFilter } : {};
    const employees = await Employee.find(employeeQuery)
      .select('empCode name department designation')
      .sort({ department: 1, empCode: 1 })
      .lean()
      .maxTimeMS(3000);

    if (employees.length === 0) {
      return successResponse({ paidLeaves: [], year, quarters: [1, 2, 3, 4] }, 'Leave status retrieved', HTTP_STATUS.OK);
    }

    const empCodes = employees.map((e) => e.empCode);
    const policy = await getLeavePolicy();
    const leavesPerQuarter = policy.leavesPerQuarter;

    // LeaveRecords for this year: paid, casual, annual (quarter view shows all paid-type leaves)
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const leaveRecords = await LeaveRecord.find({
      empCode: { $in: empCodes },
      date: { $gte: yearStart, $lte: yearEnd },
      leaveType: { $in: ['paid', 'casual', 'annual'] },
    })
      .select('empCode date leaveType')
      .lean()
      .maxTimeMS(3000);

    // Normalize date to YYYY-MM-DD (handles string or Date from DB)
    function toDateStr(d) {
      if (!d) return '';
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return String(d).slice(0, 10);
    }

    // Count and list dates per empCode per quarter (so HR can see which dates are counted and remove wrong ones)
    const countByEmpQuarter = new Map();
    const datesByEmpQuarter = new Map();
    leaveRecords.forEach((lr) => {
      const dateStr = toDateStr(lr.date);
      if (!dateStr) return;
      const { quarter } = getQuarterFromDate(dateStr);
      const key = `${lr.empCode}-${quarter}`;
      countByEmpQuarter.set(key, (countByEmpQuarter.get(key) || 0) + 1);
      if (!datesByEmpQuarter.has(key)) datesByEmpQuarter.set(key, []);
      datesByEmpQuarter.get(key).push(dateStr);
    });
    // Sort dates in each list
    datesByEmpQuarter.forEach((arr) => arr.sort());

    const paidLeaves = [];
    for (const emp of employees) {
      const q1Taken = countByEmpQuarter.get(`${emp.empCode}-1`) || 0;
      const q2Taken = countByEmpQuarter.get(`${emp.empCode}-2`) || 0;
      const q3Taken = countByEmpQuarter.get(`${emp.empCode}-3`) || 0;
      const q4Taken = countByEmpQuarter.get(`${emp.empCode}-4`) || 0;
      const row = {
        empCode: emp.empCode,
        employeeName: emp.name || '',
        department: emp.department || '',
        designation: emp.designation || '',
        year,
        q1: { allocated: leavesPerQuarter, taken: q1Taken, remaining: Math.max(0, leavesPerQuarter - q1Taken), dates: datesByEmpQuarter.get(`${emp.empCode}-1`) || [] },
        q2: { allocated: leavesPerQuarter, taken: q2Taken, remaining: Math.max(0, leavesPerQuarter - q2Taken), dates: datesByEmpQuarter.get(`${emp.empCode}-2`) || [] },
        q3: { allocated: leavesPerQuarter, taken: q3Taken, remaining: Math.max(0, leavesPerQuarter - q3Taken), dates: datesByEmpQuarter.get(`${emp.empCode}-3`) || [] },
        q4: { allocated: leavesPerQuarter, taken: q4Taken, remaining: Math.max(0, leavesPerQuarter - q4Taken), dates: datesByEmpQuarter.get(`${emp.empCode}-4`) || [] },
      };
      paidLeaves.push(row);
    }

    return successResponse(
      { paidLeaves, year, leavesPerQuarter },
      'Leave status retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// POST /api/hr/leaves - Mark paid leave (quarter-based; limit from LeavePolicy)
export async function POST(req) {
  try {
    await connectDB();

    const policy = await getLeavePolicy();
    const leavesPerQuarter = policy.leavesPerQuarter;

    const body = await req.json();
    const { empCode, date, reason, markedBy } = body;

    if (!empCode || !date) {
      throw new ValidationError('empCode and date are required');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new ValidationError('date must be YYYY-MM-DD');
    }

    const { year, quarter } = getQuarterFromDate(date);

    const employee = await Employee.findOne({ empCode }).select('empCode name').lean().maxTimeMS(2000);
    if (!employee) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    const existingLeave = await LeaveRecord.findOne({ empCode, date }).lean().maxTimeMS(2000);
    if (existingLeave) {
      throw new ValidationError(`Leave already marked for employee ${empCode} on ${date}`);
    }

    const quarterRecord = await PaidLeaveQuarter.getOrCreate(empCode, year, quarter, leavesPerQuarter);
    const maxAllowed = quarterRecord.leavesAllocated ?? leavesPerQuarter;
    if (quarterRecord.leavesTaken >= maxAllowed) {
      const quarterLabel = getQuarterLabel(year, quarter);
      throw new ValidationError(
        `This employee has used all ${maxAllowed} paid leaves for ${quarterLabel}. Per company policy, no additional paid leave can be granted for this quarter.`
      );
    }

    await LeaveRecord.create({
      empCode,
      date,
      leaveType: 'paid',
      reason: reason || '',
      markedBy: markedBy || 'HR',
    });

    quarterRecord.leavesTaken += 1;
    await quarterRecord.save();

    await ShiftAttendance.findOneAndUpdate(
      { empCode, date },
      {
        $set: {
          attendanceStatus: 'Paid Leave',
          leaveType: 'paid',
          reason: reason || 'Paid leave',
        },
      },
      { upsert: true, new: true }
    );

    const updated = await PaidLeaveQuarter.getOrCreate(empCode, year, quarter);

    return successResponse(
      {
        leaveRecord: { empCode, date, leaveType: 'paid', reason: reason || '', markedBy: markedBy || 'HR' },
        quarter: { year, quarter, leavesTaken: updated.leavesTaken, leavesRemaining: updated.leavesRemaining },
      },
      'Leave marked successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// DELETE /api/hr/leaves?empCode=XXX&date=YYYY-MM-DD - Remove paid leave
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const date = searchParams.get('date');

    if (!empCode || !date) {
      throw new ValidationError('empCode and date are required');
    }

    const leaveRecord = await LeaveRecord.findOneAndDelete({ empCode, date });
    if (!leaveRecord) {
      throw new NotFoundError('Leave record not found');
    }

    const { year, quarter } = getQuarterFromDate(date);
    const quarterRecord = await PaidLeaveQuarter.findOne({ empCode, year, quarter });
    if (quarterRecord && quarterRecord.leavesTaken > 0) {
      quarterRecord.leavesTaken -= 1;
      await quarterRecord.save();
    }

    await ShiftAttendance.findOneAndUpdate(
      { empCode, date },
      {
        $unset: { leaveType: '' },
        $set: { attendanceStatus: 'Absent' },
      }
    );

    return successResponse({ leaveRecord }, 'Leave removed successfully', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
