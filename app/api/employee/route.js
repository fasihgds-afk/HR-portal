// next-app/app/api/employee/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';
import { generateCacheKey, getOrSetCache, invalidateEmployeeCache, CACHE_TTL } from '../../../lib/cache/cacheHelper';
import { buildEmployeeFilter, getEmployeeProjection } from '../../../lib/db/queryOptimizer';

export const dynamic = 'force-dynamic';

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    // Use optimized projection (includes images for single employee, excludes base64 for lists)
    const projection = getEmployeeProjection(true); // Include images

    // If empCode is provided → return single employee (used by employee dashboard)
    if (empCode) {
      const cacheKey = generateCacheKey(`employee:${empCode}`, searchParams);
      
      const result = await getOrSetCache(
        cacheKey,
        async () => {
          const employee = await Employee.findOne({ empCode }, projection).lean();
          
          if (!employee) {
            return { error: `Employee ${empCode} not found`, status: 404 };
          }
          
          return { employee };
        },
        CACHE_TTL.EMPLOYEE_SINGLE
      );
      
      if (result.error) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      
      return NextResponse.json(result);
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';
    const shift = searchParams.get('shift') || '';
    const department = searchParams.get('department') || '';

    // Build optimized query filter
    const filter = buildEmployeeFilter({ search, shift, department });
    
    // Use optimized projection (exclude base64 images for list views)
    const listProjection = getEmployeeProjection(false);

    // Check if client wants to bypass cache (for real-time updates)
    const bypassCache = searchParams.get('_t') || searchParams.get('no-cache');
    
    // Fetch function
    const fetchEmployees = async () => {
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get total count for pagination
      const total = await Employee.countDocuments(filter);
      
      // Get paginated employees with optimized projection
      const employees = await Employee.find(filter, listProjection)
        .sort({ empCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        items: employees,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    };

    // If bypassing cache, fetch directly
    if (bypassCache) {
      const result = await fetchEmployees();
      return NextResponse.json(result);
    }

    // Otherwise, use cache for better performance
    const cacheKey = generateCacheKey('employees', searchParams);
    
    const result = await getOrSetCache(
      cacheKey,
      fetchEmployees,
      CACHE_TTL.EMPLOYEE_LIST
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/employee error:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Failed to load employees',
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

    // Invalidate cache for this employee and list
    await invalidateEmployeeCache(empCode);

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

    // Invalidate cache for this employee and list
    await invalidateEmployeeCache(empCode);

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
