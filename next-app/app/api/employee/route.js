// next-app/app/api/employee/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';

export const dynamic = 'force-dynamic';

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    // common projection so we always include image fields
    const projection = {
      empCode: 1,
      name: 1,
      email: 1,
      monthlySalary: 1,
      shift: 1,
      department: 1,
      designation: 1,
      phoneNumber: 1,
      cnic: 1,
      profileImageBase64: 1,
      profileImageUrl: 1,
      _id: 0,
    };

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

    // Otherwise → return full list (used by admin/HR UI)
    const employees = await Employee.find({}, projection)
      .sort({ empCode: 1 })
      .lean();

    return NextResponse.json({ items: employees });
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

    return NextResponse.json({ employee });
  } catch (err) {
    console.error('POST /api/employee error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
