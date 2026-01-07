// next-app/app/api/employee/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';
import { generateCacheKey, getOrSetCache, invalidateEmployeeCache, CACHE_TTL } from '../../../lib/cache/cacheHelper';
import { buildEmployeeFilter, getEmployeeProjection } from '../../../lib/db/queryOptimizer';
import { asyncHandler, NotFoundError, ValidationError } from '../../../lib/errors/errorHandler';
import { validateEmployee } from '../../../lib/validations/employee';
import { rateLimiters } from '../../../lib/middleware/rateLimit';
// Removed monitorQuery import - using direct queries to prevent double execution

export const dynamic = 'force-dynamic';

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  // Apply rate limiting
  const rateLimitResponse = await rateLimiters.read(req);
  if (rateLimitResponse) return rateLimitResponse;

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
              // Use .lean() for single employee - returns plain object directly
              const employee = await Employee.findOne({ empCode }, projection).lean();
          
          if (!employee) {
            throw new NotFoundError(`Employee ${empCode}`);
          }
          
          return { employee };
        },
        CACHE_TTL.EMPLOYEE_SINGLE
      );
      
      return NextResponse.json(result);
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';
    const shift = searchParams.get('shift') || '';
    const department = searchParams.get('department') || '';

    // Build optimized query filter and sort options
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    
    // Use optimized projection (exclude base64 images for list views)
    const listProjection = getEmployeeProjection(false);

    // Check if client wants to bypass cache (for real-time updates)
    const bypassCache = searchParams.get('_t') || searchParams.get('no-cache');
    
    // PERFORMANCE: For first page with no filters, use longer cache (most common query)
    const hasFilters = Object.keys(filter).length > 0;
    const cacheTTL = !hasFilters && page === 1 
      ? CACHE_TTL.EMPLOYEES_NO_FILTER_FIRST_PAGE // 2 minutes for first page, no filters
      : CACHE_TTL.EMPLOYEES; // 30 seconds for filtered/other pages
    
    // Fetch function
    const fetchEmployees = async () => {
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // PERFORMANCE OPTIMIZATION:
      // 1. For empty filter, skip count entirely and use a simpler approach
      // 2. Use hint() to force index usage
      // 3. Use parallel queries when count is needed
      
      const hasFilters = Object.keys(filter).length > 0;
      
      let total, employees;
      
      if (!hasFilters) {
        // No filters - fastest path: just get the data, estimate count
        // CRITICAL OPTIMIZATION: For first page, use the most efficient query possible
        // Run queries in parallel for better performance
        // CRITICAL: For first page, use the simplest possible query
        // MongoDB should automatically use the empCode index for sorting
        if (page === 1 && skip === 0) {
          // For first page, get employees first, then count (sequential to avoid overload)
          // CRITICAL: Execute query directly without wrapper to prevent double execution
          const minimalProjection = {
            _id: 1,
            empCode: 1,
            name: 1,
            email: 1,
            monthlySalary: 1,
            shift: 1,
            shiftId: 1,
            department: 1,
            designation: 1,
            profileImageUrl: 1,
          };
          
          // CRITICAL: Execute query in one chain - .lean() executes and returns plain objects
          // DO NOT call .exec() after .lean() - it causes "already executed" error
          employees = await Employee.find({}, minimalProjection)
            .sort({ empCode: 1 })
            .limit(limit)
            .maxTimeMS(20000)
            .lean(); // .lean() executes the query and returns plain objects
          
          // Get count after employees (non-blocking, but sequential)
          total = await Employee.estimatedDocumentCount().maxTimeMS(3000);
        } else {
          // For other pages, use parallel execution (less critical)
          [employees, total] = await Promise.all([
            // Execute query directly - .lean() executes and returns plain objects
            Employee.find({}, listProjection)
              .sort({ empCode: 1 })
              .skip(skip)
              .limit(limit)
              .maxTimeMS(5000)
              .lean(),
            Employee.estimatedDocumentCount().maxTimeMS(2000),
          ]);
        }
      } else {
        // Has filters - need accurate count
        [total, employees] = await Promise.all([
          Employee.countDocuments(filter).maxTimeMS(3000),
          // Execute query directly - .lean() executes and returns plain objects
          Employee.find(filter, listProjection)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .maxTimeMS(3000)
            .lean(),
        ]);
      }

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
      if (process.env.NODE_ENV === 'development') {
        console.log('[Cache] Bypassing cache - fetching fresh data');
      }
      const result = await fetchEmployees();
      return NextResponse.json(result);
    }

    // Otherwise, use cache for better performance
    const cacheKey = generateCacheKey('employees', searchParams);
    
    // Get from cache or fetch from database
    const result = await getOrSetCache(
      cacheKey,
      async () => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Cache] Cache miss for key: ${cacheKey}, fetching from database...`);
        }
        return await fetchEmployees();
      },
      cacheTTL
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Cache] Returning data for key: ${cacheKey} (TTL: ${cacheTTL}s)`);
    }

    return NextResponse.json(result);
  } catch (err) {
    const { handleError } = await import('../../../lib/errors/errorHandler');
    return handleError(err, req);
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  // Apply rate limiting (stricter for write operations)
  const rateLimitResponse = await rateLimiters.write(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    const body = await req.json();
    
    // Validate input
    const validation = validateEmployee(body, true); // true = isUpdate (partial validation)
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const validatedData = validation.data;
    const { empCode } = validatedData;

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Build update object from validated data
    const update = {};
    Object.keys(validatedData).forEach((key) => {
      if (validatedData[key] !== undefined && key !== 'empCode') {
        update[key] = validatedData[key];
      }
    });

    // Ensure salary is stored as Number
    if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
      update.monthlySalary = Number(update.monthlySalary);
    }

    // Use .lean() for update - returns plain object directly
    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // Invalidate employee caches after update
    invalidateEmployeeCache();

    return NextResponse.json({ employee });
  } catch (err) {
    const { handleError } = await import('../../../lib/errors/errorHandler');
    return handleError(err, req);
  }
}

// DELETE /api/employee?empCode=XXXXX
export async function DELETE(req) {
  // Apply rate limiting (stricter for write operations)
  const rateLimitResponse = await rateLimiters.write(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Find and delete the employee
    const deleted = await Employee.findOneAndDelete({ empCode });

    if (!deleted) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    // Invalidate all employee caches after deletion
    invalidateEmployeeCache();

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
