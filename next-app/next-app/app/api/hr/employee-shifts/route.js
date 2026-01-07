// app/api/hr/employee-shifts/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import EmployeeShiftHistory from '../../../../models/EmployeeShiftHistory';

export const dynamic = 'force-dynamic';

// GET /api/hr/employee-shifts?empCode=xxx&date=YYYY-MM-DD
// Get shift for an employee on a specific date (considering history)
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const date = searchParams.get('date'); // YYYY-MM-DD

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    const employee = await Employee.findOne({ empCode }).lean();
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // If date is provided, find the shift effective on that date
    if (date) {
      const history = await EmployeeShiftHistory.findOne({
        empCode,
        effectiveDate: { $lte: date },
        $or: [{ endDate: null }, { endDate: { $gte: date } }],
      })
        .sort({ effectiveDate: -1 })
        .lean();

      if (history) {
        const shift = await Shift.findById(history.shiftId).lean();
        return NextResponse.json({
          shift,
          shiftCode: history.shiftCode,
          effectiveDate: history.effectiveDate,
        });
      }
    }

    // If no date provided, return all shift history for this employee
    const history = await EmployeeShiftHistory.find({ empCode })
      .sort({ effectiveDate: -1 })
      .lean();

    // Populate shift details
    const historyWithShifts = await Promise.all(
      history.map(async (h) => {
        const shift = h.shiftId ? await Shift.findById(h.shiftId).lean() : null;
        return {
          ...h,
          shift,
        };
      })
    );

    // Also get current shift
    let currentShift = null;
    if (employee.shiftId) {
      currentShift = await Shift.findById(employee.shiftId).lean();
    } else if (employee.shift) {
      currentShift = await Shift.findOne({ code: employee.shift, isActive: true }).lean();
    }

    return NextResponse.json({
      history: historyWithShifts,
      currentShift,
      shiftCode: currentShift?.code || employee.shift,
    });
  } catch (err) {
    console.error('GET /api/hr/employee-shifts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/hr/employee-shifts - Assign or change employee shift
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { empCode, shiftId, effectiveDate, reason, changedBy } = body;

    if (!empCode || !shiftId || !effectiveDate) {
      return NextResponse.json(
        { error: 'empCode, shiftId, and effectiveDate are required' },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(effectiveDate)) {
      return NextResponse.json(
        { error: 'effectiveDate must be in YYYY-MM-DD format' },
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

    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return NextResponse.json(
        { error: 'Shift not found' },
        { status: 404 }
      );
    }

    // End the previous shift assignment if it exists
    await EmployeeShiftHistory.updateMany(
      {
        empCode,
        endDate: null, // Only update active assignments
      },
      {
        $set: {
          endDate: effectiveDate, // Set end date to the day before new shift starts
        },
      }
    );

    // Create new shift assignment
    const history = await EmployeeShiftHistory.create({
      empCode,
      shiftId,
      shiftCode: shift.code,
      effectiveDate,
      endDate: null, // Current/active assignment
      reason: reason || '',
      changedBy: changedBy || '',
    });

    // Update employee's current shift reference
    employee.shiftId = shiftId;
    employee.shift = shift.code; // Keep legacy field updated
    await employee.save();

    return NextResponse.json(
      {
        history,
        message: `Shift ${shift.name} (${shift.code}) assigned to employee from ${effectiveDate}`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/hr/employee-shifts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

