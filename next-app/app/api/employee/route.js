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
    // Always log in production for debugging
    console.log('[Employee API] GET request received:', {
      url: req.url,
      hasMongoUri: !!process.env.MONGO_URI,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
    });

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

    // First, check total employees in database (without any filter) for debugging
    const totalEmployeesInDB = await Employee.countDocuments({});
    console.log('[Employee API] 🔍 Total employees in database (no filter):', totalEmployeesInDB);
    
    // If no employees in database at all, return early
    if (totalEmployeesInDB === 0) {
      console.warn('[Employee API] ⚠️ No employees found in database at all!');
      return NextResponse.json({
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
        debug: {
          message: 'No employees in database',
          totalInDB: 0,
        },
      });
    }
    
    // Build optimized query filter
    let filter, sortOptions;
    try {
      const filterResult = buildEmployeeFilter({ search, shift, department });
      filter = filterResult.filter;
      sortOptions = filterResult.sortOptions;
    } catch (filterError) {
      console.error('[Employee API] Error building filter:', filterError);
      // Fallback to empty filter if buildEmployeeFilter fails
      filter = {};
      sortOptions = { empCode: 1 };
    }
    
    // Log filter details for debugging
    console.log('[Employee API] Filter params:', {
      search: search || '(empty)',
      shift: shift || '(empty)',
      department: department || '(empty)',
      builtFilter: JSON.stringify(filter),
    });
    
    // Use optimized projection (exclude base64 images for list views)
    let listProjection;
    try {
      listProjection = getEmployeeProjection(false);
    } catch (projError) {
      console.error('[Employee API] Error getting projection:', projError);
      // Fallback to basic projection
      listProjection = {
        empCode: 1,
        name: 1,
        email: 1,
        shift: 1,
        department: 1,
        designation: 1,
        monthlySalary: 1,
      };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    let total;
    try {
      total = await Employee.countDocuments(filter);
      console.log('[Employee API] Total employees matching filter:', total);
    } catch (countError) {
      console.error('[Employee API] Error counting documents:', countError);
      total = 0;
    }
    
    // If filter returns 0 but database has employees, log warning
    if (total === 0 && totalEmployeesInDB > 0) {
      console.warn('[Employee API] ⚠️ Filter is too restrictive! Database has', totalEmployeesInDB, 'employees but filter returns 0');
      console.warn('[Employee API] Filter details:', JSON.stringify(filter));
    }
    
    // Get paginated employees with optimized projection
    let employees = [];
    try {
      employees = await Employee.find(filter, listProjection)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean();
      console.log('[Employee API] Employees found:', employees?.length || 0);
    } catch (findError) {
      console.error('[Employee API] Error finding employees:', findError);
      // Try without projection as fallback
      try {
        employees = await Employee.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean();
        console.log('[Employee API] Employees found (fallback query):', employees?.length || 0);
      } catch (fallbackError) {
        console.error('[Employee API] Fallback query also failed:', fallbackError);
        // Last resort: try simplest query like /api/hr/employees
        try {
          console.log('[Employee API] Trying simplest query as last resort...');
          employees = await Employee.find({})
            .select('empCode name email monthlySalary shift shiftId department designation phoneNumber cnic profileImageUrl saturdayGroup')
            .sort({ empCode: 1 })
            .skip(skip)
            .limit(limit)
            .lean();
          console.log('[Employee API] Employees found (simple query):', employees?.length || 0);
          // Update total to match simple query
          total = await Employee.countDocuments({});
        } catch (simpleError) {
          console.error('[Employee API] Even simple query failed:', simpleError);
          employees = [];
        }
      }
    }

    // Log result for debugging (always log in production to help diagnose)
    console.log('[Employee API] Query result:', {
      employeesCount: employees?.length || 0,
      total,
      page,
      limit,
      search,
      shift,
      department,
      filter: JSON.stringify(filter),
      sortOptions: JSON.stringify(sortOptions),
    });

    // Always return items array, even if empty
    const response = {
      items: employees || [],
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
      // Always add debug info to help diagnose
      debug: {
        totalInDB: totalEmployeesInDB,
        employeesFound: employees?.length || 0,
        totalMatchingFilter: total || 0,
        filter: filter || {},
        hasFilter: Object.keys(filter || {}).length > 0,
        search: search || null,
        shift: shift || null,
        department: department || null,
      },
    };

    console.log('[Employee API] Response:', {
      itemsCount: response.items.length,
      total: response.pagination.total,
      totalInDB: totalEmployeesInDB,
      debug: response.debug,
    });

    return NextResponse.json(response);
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
