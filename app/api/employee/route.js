// next-app/app/api/employee/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Employee from '@/models/Employee';
import { buildEmployeeFilter, getEmployeeProjection } from '@/lib/db/queryOptimizer';

export const dynamic = 'force-dynamic';

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    // Log request for debugging (only in production to help diagnose)
    if (process.env.NODE_ENV === 'production') {
      console.log('[Employee API] GET request received:', {
        url: req.url,
        hasMongoUri: !!process.env.MONGO_URI,
        timestamp: new Date().toISOString(),
      });
    }

    // Connect to database
    try {
      await connectDB();
      if (process.env.NODE_ENV === 'production') {
        console.log('[Employee API] Database connected successfully');
      }
    } catch (dbError) {
      console.error('[Employee API] Database connection error:', dbError);
      console.error('[Employee API] Error details:', {
        message: dbError.message,
        name: dbError.name,
        hasMongoUri: !!process.env.MONGO_URI,
      });
      return NextResponse.json(
        {
          error: 'Database connection failed. Please check MONGO_URI environment variable in Vercel.',
          details: process.env.NODE_ENV === 'development' ? dbError.message : 'Check Vercel Function Logs for details',
          hasMongoUri: !!process.env.MONGO_URI,
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    // Use optimized projection (includes images for single employee, excludes base64 for lists)
    const projection = getEmployeeProjection(true); // Include images

    // If empCode is provided → return single employee (used by employee dashboard)
    if (empCode) {
      const employee = await Employee.findOne({ empCode }, projection).lean();
      
      if (!employee) {
        return NextResponse.json(
          { error: `Employee ${empCode} not found` },
          { status: 404 }
        );
      }
      
      return NextResponse.json({ employee });
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';
    const shift = searchParams.get('shift') || '';
    const department = searchParams.get('department') || '';

    // Build optimized query filter
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    
    // Use optimized projection (exclude base64 images for list views)
    const listProjection = getEmployeeProjection(false);

    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    const total = await Employee.countDocuments(filter);
    
    // Get paginated employees with optimized projection
    const employees = await Employee.find(filter, listProjection)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();

    // Log result for debugging
    if (process.env.NODE_ENV === 'production') {
      console.log('[Employee API] Query result:', {
        employeesCount: employees?.length || 0,
        total,
        page,
        limit,
        filter: Object.keys(filter).length > 0 ? 'has filters' : 'no filters',
      });
    }

    // Always return items array, even if empty
    return NextResponse.json({
      items: employees || [],
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    });
  } catch (err) {
    console.error('GET /api/employee error:', err);
    console.error('Error stack:', err.stack);
    return NextResponse.json(
      {
        error: err?.message || 'Failed to load employees',
        ...(process.env.NODE_ENV === 'development' && { 
          stack: err.stack,
          details: err.toString() 
        }),
      },
      { status: 500 }
    );
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { empCode, ...updateData } = body;

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    // Build update object (exclude empCode from update)
    const update = {};
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined) {
        update[key] = updateData[key];
      }
    });

    if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
      update.monthlySalary = Number(update.monthlySalary);
    }

    // Execute update
    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ employee });
  } catch (err) {
    console.error('POST /api/employee error:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Failed to save employee',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/employee?empCode=XXXXX
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    const deleted = await Employee.findOneAndDelete({ empCode });

    if (!deleted) {
      return NextResponse.json(
        { error: `Employee ${empCode} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Employee ${empCode} deleted successfully`,
      employee: deleted,
    });
  } catch (err) {
    console.error('DELETE /api/employee error:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Failed to delete employee',
      },
      { status: 500 }
    );
  }
}
