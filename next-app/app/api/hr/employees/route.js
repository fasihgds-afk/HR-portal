// next-app/app/api/hr/employees/route.js
import { connectDB } from "@/lib/db";
import Employee from "@/models/Employee";
import { getOrSetCache, CACHE_TTL } from "@/lib/cache/cacheHelper";

export async function GET() {
  try {
    // Get from cache or fetch from database
    const result = await getOrSetCache(
      'hr-employees',
      async () => {
        await connectDB();

        // PERFORMANCE: Select only needed fields (exclude large base64 images)
        const employees = await Employee.find({})
          .select('empCode name email monthlySalary shift shiftId department designation phoneNumber cnic profileImageUrl saturdayGroup')
          .lean()
          .sort({ department: 1, empCode: 1 }); // Sort in database instead of in-memory

        return { employees };
      },
      CACHE_TTL.EMPLOYEES
    );

    // Add cache headers for better performance (5 minutes cache)
    return Response.json(result, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error("GET /api/hr/employees error:", err);
    return Response.json(
      {
        error: err?.message || "Failed to load employees",
      },
      { status: 500 }
    );
  }
}
