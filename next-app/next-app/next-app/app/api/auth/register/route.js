// next-app/app/api/auth/register/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';   // ✅ match your db.js
import User from '@/models/User';
import Employee from '@/models/Employee';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    await connectDB(); // ✅ use connectDB

    const body = await req.json();
    const { email, password, role, empCode, secretKey } = body;

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: 'email, password and role are required' },
        { status: 400 }
      );
    }

    if (!['HR', 'EMPLOYEE'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Use HR or EMPLOYEE.' },
        { status: 400 }
      );
    }

    // For HR users, require valid secret key
    if (role === 'HR') {
      if (!secretKey) {
        return NextResponse.json(
          { error: 'Secret key is required for HR role' },
          { status: 400 }
        );
      }

      const validSecretKey = process.env.HR_SECRET_KEY;
      if (!validSecretKey) {
        console.error('[REGISTER ERROR] HR_SECRET_KEY is not set in environment variables');
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      if (secretKey !== validSecretKey) {
        return NextResponse.json(
          { error: 'Invalid secret key' },
          { status: 401 }
        );
      }
    }

    // For EMPLOYEE users, require valid empCode that exists in Employee collection
    let employeeDoc = null;
    if (role === 'EMPLOYEE') {
      if (!empCode) {
        return NextResponse.json(
          { error: 'empCode is required for EMPLOYEE role' },
          { status: 400 }
        );
      }

      employeeDoc = await Employee.findOne({ empCode });
      if (!employeeDoc) {
        return NextResponse.json(
          { error: `No employee found with empCode ${empCode}` },
          { status: 404 }
        );
      }
    }

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email,
      passwordHash,
      role,
      employeeEmpCode: role === 'EMPLOYEE' ? employeeDoc.empCode : undefined,
    });

    return NextResponse.json(
      {
        message: 'User registered successfully',
        userId: newUser._id,
        role: newUser.role,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    return NextResponse.json(
      { error: 'Server error while registering user' },
      { status: 500 }
    );
  }
}
