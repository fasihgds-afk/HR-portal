// next-app/app/api/employee/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';
import { buildEmployeeFilter, getEmployeeProjection } from '../../../lib/db/queryOptimizer';
import { NotFoundError, ValidationError } from '../../../lib/errors/errorHandler';
import { validateEmployee } from '../../../lib/validations/employee';

// SIMPLE APPROACH - No caching, no wrappers, no monitoring - just direct Mongoose queries with .lean()
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    // If empCode is provided → return single employee (used by employee dashboard)
    if (empCode) {
      // SIMPLE: Use Mongoose with .select() and .lean() - execute immediately
      const projection = getEmployeeProjection(true);
      const employee = await Employee.findOne({ empCode })
        .select(projection)
        .lean();
      
      if (!employee) {
        throw new NotFoundError(`Employee ${empCode}`);
      }
      
      return NextResponse.json({ employee });
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = (searchParams.get('search') || '').trim();
    let shift = (searchParams.get('shift') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    
    // Normalize "All Shifts" - empty string means all shifts
    if (shift === 'All Shifts' || shift === 'all shifts') {
      shift = '';
    }

    // Build filter and projection
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    const listProjection = getEmployeeProjection(false);
    const skip = (page - 1) * limit;
    
    // Use aggregation pipeline - completely bypasses Mongoose query builder
    const queryFilter = Object.keys(filter).length > 0 ? filter : {};
    
    // Build aggregation pipeline with projection FIRST (better performance)
    const pipeline = [
      { $match: queryFilter },
      { $project: {
        _id: 1,
        empCode: 1,
        name: 1,
        email: 1,
        monthlySalary: 1,
        shift: 1,
        shiftId: 1,
        department: 1,
        designation: 1,
        phoneNumber: 1,
        cnic: 1,
        saturdayGroup: 1,
        profileImageUrl: 1,
      }},
      { $sort: sortOptions || { empCode: 1 } },
      { $skip: skip },
      { $limit: limit },
    ];
    
    // Execute aggregation (returns plain objects, no Mongoose documents)
    const employees = await Employee.aggregate(pipeline);
    
    // Execute count separately
    const total = await Employee.countDocuments(queryFilter);

    return NextResponse.json({
      items: employees || [],
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    const { handleError } = await import('../../../lib/errors/errorHandler');
    return handleError(err, req);
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    
    // Validate input
    const validation = validateEmployee(body, true);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const validatedData = validation.data;
    const { empCode } = validatedData;

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Build update object
    const update = {};
    Object.keys(validatedData).forEach((key) => {
      if (validatedData[key] !== undefined && key !== 'empCode') {
        update[key] = validatedData[key];
      }
    });

    if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
      update.monthlySalary = Number(update.monthlySalary);
    }

    // Execute update directly
    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ employee });
  } catch (err) {
    const { handleError } = await import('../../../lib/errors/errorHandler');
    return handleError(err, req);
  }
}

// DELETE /api/employee?empCode=XXXXX
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    const deleted = await Employee.findOneAndDelete({ empCode });

    if (!deleted) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    return NextResponse.json({
      success: true,
      message: `Employee ${empCode} deleted successfully`,
      employee: deleted,
    });
  } catch (err) {
    const { handleError } = await import('../../../lib/errors/errorHandler');
    return handleError(err, req);
  }
}
