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
export const runtime = 'nodejs'; // Explicitly set runtime for Vercel
export const fetchCache = 'force-no-store'; // Disable fetch caching

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    // Log all requests for debugging (including production)
    console.log('[Employee API] GET request received:', {
      url: req.url,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
    });

    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    
    console.log('[Employee API] Query params:', { empCode, searchParams: Object.fromEntries(searchParams) });

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

    // Build filter
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    const skip = (page - 1) * limit;
    
    // Use direct Mongoose queries instead of aggregation for simplicity and reliability
    // Aggregation can have issues in serverless environments
    const queryFilter = Object.keys(filter).length > 0 ? filter : {};
    
    // Log filter for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee API] Query filter:', queryFilter);
    }
    
    // Get projection from helper (consistent with other queries)
    const listProjection = getEmployeeProjection(false);
    
    // Execute queries sequentially to avoid any issues
    const employees = await Employee.find(queryFilter)
      .select(listProjection)
      .sort(sortOptions || { empCode: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(); // Explicitly execute the query
    
    const total = await Employee.countDocuments(queryFilter).exec();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee API] Query result:', { count: employees.length, total });
    }

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
