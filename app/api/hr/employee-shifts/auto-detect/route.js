// app/api/hr/employee-shifts/auto-detect/route.js
// Auto-detect and create shift history from existing attendance records
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import Shift from '../../../../../models/Shift';
import ShiftAttendance from '../../../../../models/ShiftAttendance';
import EmployeeShiftHistory from '../../../../../models/EmployeeShiftHistory';

export const dynamic = 'force-dynamic';

// POST /api/hr/employee-shifts/auto-detect
// Body: { empCode, month (optional) }
// Auto-detects shift changes from attendance records and creates history
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { empCode, month } = body;

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    const employee = await Employee.findOne({ empCode });
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Build query for attendance records
    const query = { empCode };
    if (month) {
      const [year, monthNum] = month.split('-');
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Check if shifts exist in database first
    const shiftCount = await Shift.countDocuments({ isActive: true });
    if (shiftCount === 0) {
      return NextResponse.json({
        error: 'No shifts found in database. Please create shifts first by visiting the Shift Management page (/hr/shifts) or running the migration endpoint.',
        empCode,
        created: [],
        suggestion: 'Visit /hr/shifts to create shifts, or use /api/hr/shifts/migrate to create default shifts.',
      }, { status: 400 });
    }

    // Get all attendance records for this employee, sorted by date
    const attendanceRecords = await ShiftAttendance.find(query)
      .sort({ date: 1 })
      .lean();

    if (attendanceRecords.length === 0) {
      return NextResponse.json({
        message: 'No attendance records found for this employee',
        empCode,
        created: [],
        suggestion: 'Make sure attendance has been processed for this employee.',
      });
    }

    // Count records with and without shift codes
    const recordsWithShift = attendanceRecords.filter(r => r.shift).length;
    const recordsWithoutShift = attendanceRecords.length - recordsWithShift;

    // Group consecutive days with the same shift
    const shiftPeriods = [];
    let currentPeriod = null;

    for (const record of attendanceRecords) {
      const shiftCode = record.shift;
      if (!shiftCode) {
        // Skip records without shift codes, but log them
        continue;
      }

      if (!currentPeriod || currentPeriod.shiftCode !== shiftCode) {
        // Start new period
        if (currentPeriod) {
          // End previous period (day before current date)
          const prevDate = new Date(record.date);
          prevDate.setDate(prevDate.getDate() - 1);
          currentPeriod.endDate = prevDate.toISOString().slice(0, 10);
          shiftPeriods.push(currentPeriod);
        }

        currentPeriod = {
          shiftCode,
          startDate: record.date,
          endDate: null,
          records: [record.date],
        };
      } else {
        // Continue current period
        currentPeriod.records.push(record.date);
      }
    }

    // Add last period
    if (currentPeriod) {
      shiftPeriods.push(currentPeriod);
    }

    if (shiftPeriods.length === 0) {
      return NextResponse.json({
        message: 'No shift periods detected',
        empCode,
        created: [],
        details: {
          totalRecords: attendanceRecords.length,
          recordsWithShift,
          recordsWithoutShift,
          suggestion: recordsWithoutShift > 0 
            ? 'Some attendance records are missing shift codes. The system will use the employee\'s current shift for those days.'
            : 'All records have shift codes, but no periods could be detected. Check if shifts exist in the database.',
        },
      });
    }

    // Get all active shifts for lookup
    const allShifts = await Shift.find({ isActive: true }).lean();
    const shiftMap = new Map();
    allShifts.forEach((s) => shiftMap.set(s.code, s));

    // Create shift history records
    const results = [];
    const createdRecords = [];

    // End any existing active shift assignments
    await EmployeeShiftHistory.updateMany(
      { empCode, endDate: null },
      { $set: { endDate: shiftPeriods[0].startDate } }
    );

    for (let i = 0; i < shiftPeriods.length; i++) {
      const period = shiftPeriods[i];
      const shift = shiftMap.get(period.shiftCode);

      if (!shift) {
        results.push({
          shiftCode: period.shiftCode,
          startDate: period.startDate,
          status: 'error',
          error: `Shift ${period.shiftCode} not found in database`,
        });
        continue;
      }

      // Calculate end date (day before next period starts, or null if last)
      let endDate = period.endDate;
      if (!endDate && i < shiftPeriods.length - 1) {
        const nextStart = new Date(shiftPeriods[i + 1].startDate);
        nextStart.setDate(nextStart.getDate() - 1);
        endDate = nextStart.toISOString().slice(0, 10);
      }

      // Check if history already exists for this period
      const existing = await EmployeeShiftHistory.findOne({
        empCode,
        effectiveDate: period.startDate,
        shiftCode: period.shiftCode,
      });

      if (existing) {
        results.push({
          shiftCode: period.shiftCode,
          startDate: period.startDate,
          endDate,
          status: 'exists',
          historyId: existing._id,
        });
        continue;
      }

      // Create history record
      const history = await EmployeeShiftHistory.create({
        empCode,
        shiftId: shift._id,
        shiftCode: shift.code,
        effectiveDate: period.startDate,
        endDate: endDate || null,
        reason: `Auto-detected from attendance records (${period.records.length} days)`,
        changedBy: 'system-auto-detect',
      });

      createdRecords.push(history);
      results.push({
        shiftCode: period.shiftCode,
        startDate: period.startDate,
        endDate,
        status: 'created',
        historyId: history._id,
        daysCount: period.records.length,
      });
    }

    // Update employee's current shift to the last detected shift
    if (shiftPeriods.length > 0) {
      const lastPeriod = shiftPeriods[shiftPeriods.length - 1];
      const lastShift = shiftMap.get(lastPeriod.shiftCode);
      if (lastShift) {
        employee.shiftId = lastShift._id;
        employee.shift = lastShift.code;
        await employee.save();
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      exists: results.filter((r) => r.status === 'exists').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    return NextResponse.json({
      message: summary.created > 0 
        ? `Successfully created ${summary.created} shift period(s)`
        : summary.exists > 0
        ? 'Shift history already exists for these periods'
        : 'No shift history created',
      empCode,
      periodsDetected: shiftPeriods.length,
      created: results,
      summary,
      details: {
        totalRecords: attendanceRecords.length,
        recordsWithShift,
        recordsWithoutShift,
      },
    });
  } catch (err) {
    console.error('POST /api/hr/employee-shifts/auto-detect error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

