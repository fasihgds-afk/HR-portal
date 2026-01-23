// next-app/app/api/hr/employees/route.js
import { connectDB } from "../../../../lib/db";
import Employee from "../../../../models/Employee";
import { successResponse, errorResponseFromException, HTTP_STATUS } from "../../../../lib/api/response";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
  try {
    await connectDB();

    // OPTIMIZATION: Sort uses compound index { department: 1, empCode: 1 } for fast sorting
    // MongoDB query planner will automatically use the best index
    const employees = await Employee.find({})
      .select('empCode name email monthlySalary shift shiftId department designation phoneNumber cnic profileImageUrl saturdayGroup')
      .sort({ department: 1, empCode: 1 }) // Uses compound index for fast sorting
      .lean()
      .maxTimeMS(5000); // Timeout after 5 seconds to prevent hanging

    return successResponse(
      { employees },
      'Employees retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
