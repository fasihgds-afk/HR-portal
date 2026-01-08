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
    
    // Get from cache or fetch from database
    const result = await getOrSetCache(
      cacheKey,
      fetchEmployees,
      CACHE_TTL.EMPLOYEES
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/employee error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      empCode,
      name,
      email,
      monthlySalary,
      shift,
      department,
      designation,

      // 🔹 NEW FIELDS
      phoneNumber,
      cnic,
      profileImageBase64,
      profileImageUrl,
    } = body;

    if (!empCode) {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    const update = {};

    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;

    // make sure salary is stored as Number
    if (monthlySalary !== undefined && monthlySalary !== null) {
      const numSalary = Number(monthlySalary);
      if (!Number.isNaN(numSalary)) {
        update.monthlySalary = numSalary;
      }
    }

    if (shift !== undefined) update.shift = shift;
    if (department !== undefined) update.department = department;
    if (designation !== undefined) update.designation = designation;

    // 🔹 save new fields
    if (phoneNumber !== undefined) update.phoneNumber = phoneNumber;
    if (cnic !== undefined) update.cnic = cnic;

    // image can be base64 or a URL
    if (profileImageBase64 !== undefined)
      update.profileImageBase64 = profileImageBase64;

    if (profileImageUrl !== undefined)
      update.profileImageUrl = profileImageUrl;

    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // Invalidate employee caches after update
    invalidateEmployeeCache();

    return NextResponse.json({ employee });
  } catch (err) {
    console.error('POST /api/employee error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
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

    // Find and delete the employee
    const deleted = await Employee.findOneAndDelete({ empCode });

    if (!deleted) {
      return NextResponse.json(
        { error: `Employee ${empCode} not found` },
        { status: 404 }
      );
    }

    // Invalidate all employee caches after deletion
    invalidateEmployeeCache();

    return NextResponse.json({
      success: true,
      message: `Employee ${empCode} deleted successfully`,
      employee: deleted,
    });
  } catch (err) {
    console.error('DELETE /api/employee error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
