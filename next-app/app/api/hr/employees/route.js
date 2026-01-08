// next-app/app/api/hr/employees/route.js
import { connectDB } from "@/lib/db";
import Employee from "@/models/Employee";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await connectDB();

    // Direct database query - no caching for real-time data
    const employees = await Employee.find({})
      .select('empCode name email monthlySalary shift shiftId department designation phoneNumber cnic profileImageUrl saturdayGroup')
      .lean()
      .sort({ department: 1, empCode: 1 });

    return Response.json(
      { employees },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
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
