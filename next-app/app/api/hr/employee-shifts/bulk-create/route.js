// app/api/hr/employee-shifts/bulk-create/route.js
// Helper endpoint to create shift history records for employees
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import Shift from '../../../../../models/Shift';
import EmployeeShiftHistory from '../../../../../models/EmployeeShiftHistory';

export const dynamic = 'force-dynamic';

// POST /api/hr/employee-shifts/bulk-create
// Body: { empCode, shifts: [{ shiftCode, startDate, endDate }] }
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { empCode, shifts } = body;

    if (!empCode || !Array.isArray(shifts) || shifts.length === 0) {
      return NextResponse.json(
        { error: 'empCode and shifts array are required' },
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

    const results = [];

    // Sort shifts by startDate
    const sortedShifts = [...shifts].sort((a, b) => 
      a.startDate.localeCompare(b.startDate)
    );

    // End previous shift assignments
    await EmployeeShiftHistory.updateMany(
      { empCode, endDate: null },
      { $set: { endDate: sortedShifts[0].startDate } }
    );

    // Create new shift history records
    for (let i = 0; i < sortedShifts.length; i++) {
      const { shiftCode, startDate, endDate } = sortedShifts[i];

      // Find shift by code
      const shift = await Shift.findOne({ code: shiftCode, isActive: true });
      if (!shift) {
        results.push({
          shiftCode,
          startDate,
          status: 'error',
          error: `Shift ${shiftCode} not found`,
        });
        continue;
      }

      // Calculate end date (day before next shift starts, or null if last)
      let calculatedEndDate = endDate;
      if (!calculatedEndDate && i < sortedShifts.length - 1) {
        // Set end date to day before next shift starts
        const nextStart = new Date(sortedShifts[i + 1].startDate);
        nextStart.setDate(nextStart.getDate() - 1);
        calculatedEndDate = nextStart.toISOString().slice(0, 10);
      }

      // Create history record
      const history = await EmployeeShiftHistory.create({
        empCode,
        shiftId: shift._id,
        shiftCode: shift.code,
        effectiveDate: startDate,
        endDate: calculatedEndDate || null,
        reason: `Bulk assignment: ${shiftCode} from ${startDate}${calculatedEndDate ? ` to ${calculatedEndDate}` : ''}`,
        changedBy: 'system',
      });

      results.push({
        shiftCode,
        startDate,
        endDate: calculatedEndDate,
        status: 'created',
        historyId: history._id,
      });
    }

    // Update employee's current shift to the last one
    const lastShift = sortedShifts[sortedShifts.length - 1];
    const lastShiftObj = await Shift.findOne({ code: lastShift.shiftCode, isActive: true });
    if (lastShiftObj) {
      employee.shiftId = lastShiftObj._id;
      employee.shift = lastShiftObj.code;
      await employee.save();
    }

    return NextResponse.json({
      message: 'Shift history created successfully',
      empCode,
      results,
    });
  } catch (err) {
    console.error('POST /api/hr/employee-shifts/bulk-create error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

