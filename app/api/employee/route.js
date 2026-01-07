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

// Force dynamic rendering and disable all caching to prevent Mongoose query issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
              // Use native driver for single employee (production-safe)
              const employee = await Employee.collection.findOne(
                { empCode },
                { projection }
              );
          
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
    const search = (searchParams.get('search') || '').trim();
    let shift = (searchParams.get('shift') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    
    // Normalize "All Shifts" - empty string means all shifts
    if (shift === 'All Shifts' || shift === 'all shifts') {
      shift = '';
    }

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
    
    // PRODUCTION-SAFE: Use native MongoDB driver directly (avoid Mongoose double-execution issues on Vercel)
    // Native driver is more reliable in serverless environments - COMPLETELY BYPASSES MONGOOSE
    const fetchEmployees = async () => {
      const skip = (page - 1) * limit;
      
      // Get native MongoDB collection directly - NO MONGOOSE INVOLVEMENT
      const col = Employee.collection;
      
      // Ensure filter is a valid object (empty object is valid for "find all")
      const queryFilter = filter && Object.keys(filter).length > 0 ? filter : {};
      
      // Native driver syntax: find(filter, options) - options can include projection, sort, skip, limit
      // OR use method chaining: find(filter).sort().skip().limit().toArray()
      // Using method chaining is more reliable for serverless environments
      
      try {
        // Build find cursor with method chaining (most reliable approach)
        let cursor = col.find(queryFilter);
        
        // Apply projection if specified
        if (listProjection && Object.keys(listProjection).length > 0) {
          cursor = cursor.project(listProjection);
        }
        
        // Apply sort, skip, limit
        cursor = cursor.sort(sortOptions || { empCode: 1 });
        cursor = cursor.skip(skip);
        cursor = cursor.limit(limit);
        
        // Execute queries using native driver - NO MONGOOSE INVOLVEMENT
        const [employees, total] = await Promise.all([
          cursor.toArray(),
          hasFilters
            ? col.countDocuments(queryFilter)
            : col.estimatedDocumentCount(),
        ]);

        return {
          items: employees || [],
          pagination: {
            page,
            limit,
            total: total || 0,
            totalPages: Math.ceil((total || 0) / limit),
          },
        };
      } catch (err) {
        // Log detailed error for debugging
        console.error('[Employee API] Native driver query failed:', {
          message: err.message,
          name: err.name,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
          filter,
          skip,
          limit,
        });
        throw err;
      }
    };

    // DISABLE CACHE - Fetch directly every time to ensure we're using native driver
    // This prevents any cached Mongoose query objects from being returned
    const result = await fetchEmployees();
    
    // Add cache-busting headers to prevent Vercel from caching the response
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Cache-Status': 'BYPASS',
      },
    });
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
