// next-app/app/api/hr/employees/route.js
import { connectDB } from "../../../../lib/db";
import Employee from "../../../../models/Employee";
import { successResponse, errorResponseFromException, HTTP_STATUS } from "../../../../lib/api/response";

// OPTIMIZATION: Node.js runtime for better MongoDB connection pooling
export const runtime = 'nodejs';

// OPTIMIZATION: Caching with 60s revalidation for faster responses
export const revalidate = 60;

// OPTIMIZATION: Minimal field selection for list views (excludes heavy fields like profileImageUrl, cnic)
// Removed: profileImageUrl (large), cnic (not needed for list), phoneNumber (not needed for stats)
const EMPLOYEE_LIST_FIELDS = 'empCode name email monthlySalary shift shiftId department designation saturdayGroup';

export async function GET(req) {
  const startTime = Date.now();
  
  try {
    // OPTIMIZATION: Connect DB (cached singleton, no reconnection per request)
    await connectDB();

    // OPTIMIZATION: Parse pagination params with defaults and limits
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // OPTIMIZATION: Run count and data queries in parallel for faster response
    // MongoDB will auto-select the compound index { department: 1, empCode: 1 } for sorting
    const [total, employees] = await Promise.all([
      Employee.countDocuments({})
        .maxTimeMS(2500), // Reduced timeout
      Employee.find({})
        .select(EMPLOYEE_LIST_FIELDS)
        .sort({ department: 1, empCode: 1 }) // Uses compound index { department: 1, empCode: 1 }
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(2500) // Reduced timeout
    ]);

    const hasNext = skip + employees.length < total;
    const totalPages = Math.ceil(total / limit);

    // OPTIMIZATION: Response size control - log payload size
    const responseData = { employees };
    const meta = {
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrev: page > 1
    };

    const responseJson = JSON.stringify({ ...responseData, meta });
    const responseSizeKB = Buffer.byteLength(responseJson, 'utf8') / 1024;
    
    // Log response time and size for monitoring
    const responseTime = Date.now() - startTime;
    if (responseSizeKB > 100) {
      console.warn(`[employees] Large response: ${responseSizeKB.toFixed(2)}KB (${employees.length} employees)`);
    }
    if (responseTime > 1000) {
      console.warn(`[employees] Slow response: ${responseTime}ms`);
    }
    
    // OPTIMIZATION: Add cache headers for Next.js revalidation
    // Pass meta as 4th parameter to successResponse (top-level in response)
    const response = successResponse(
      responseData,
      'Employees retrieved successfully',
      HTTP_STATUS.OK,
      meta
    );

    // Override cache control for this endpoint (60s revalidation)
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    
    return response;
  } catch (err) {
    const responseTime = Date.now() - startTime;
    console.error(`[employees] Error after ${responseTime}ms:`, err.message);
    return errorResponseFromException(err, req);
  }
}
