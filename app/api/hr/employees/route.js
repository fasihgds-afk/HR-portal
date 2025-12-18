// next-app/app/api/hr/employees/route.js
import { connectDB } from "@/lib/db";
import Employee from "@/models/Employee";

export async function GET() {
  try {
    // connect to Mongo
    await connectDB();

    // fetch all employees (you can add filters later)
    const employees = await Employee.find({}).lean();

    // optional: sort by department + empCode
    employees.sort((a, b) => {
      const deptA = (a.department || "").toLowerCase();
      const deptB = (b.department || "").toLowerCase();
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return Response.json({ employees }, { status: 200 });
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
