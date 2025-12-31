// next-app/app/api/hr/employees/route.js
import { connectDB } from "@/lib/db";
import Employee from "@/models/Employee";

export async function GET() {
  try {
    // connect to Mongo
    await connectDB();

    // PERFORMANCE: Select only needed fields (exclude large base64 images)
    const employees = await Employee.find({})
      .select('empCode name email monthlySalary shift shiftId department designation phoneNumber cnic profileImageUrl saturdayGroup')
      .lean()
      .sort({ department: 1, empCode: 1 }); // Sort in database instead of in-memory

    // Add cache headers for better performance (5 minutes cache)
    return Response.json({ employees }, { 
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
