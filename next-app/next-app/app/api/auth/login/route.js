// next-app/app/api/auth/login/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';   // ✅
import User from '@/models/User';
import Employee from '@/models/Employee';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { role, email, password, empCode, cnic } = body;

    if (!role) {
      return NextResponse.json({ error: 'role is required' }, { status: 400 });
    }

    // HR login
    if (role === 'HR') {
      if (!email || !password) {
        return NextResponse.json(
          { error: 'email and password are required for HR login' },
          { status: 400 }
        );
      }

      const user = await User.findOne({ email, role: 'HR' });
      if (!user) {
        return NextResponse.json(
          { error: 'Invalid HR credentials' },
          { status: 401 }
        );
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: 'Invalid HR credentials' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { message: 'HR login ok', role: 'HR' },
        { status: 200 }
      );
    }

    // Employee login
    if (role === 'EMPLOYEE') {
      if (!empCode || !cnic) {
        return NextResponse.json(
          { error: 'empCode and cnic are required for employee login' },
          { status: 400 }
        );
      }

      const employee = await Employee.findOne({ empCode, cnic });
      if (!employee) {
        return NextResponse.json(
          { error: 'Employee not found for given code + CNIC' },
          { status: 401 }
        );
      }

      let user = await User.findOne({
        role: 'EMPLOYEE',
        employeeEmpCode: empCode,
      });

      // Optionally auto-create a User row once employee is verified
      if (!user) {
        user = await User.create({
          email: `${empCode}@auto.gds.local`,
          passwordHash: await bcrypt.hash(cnic, 10),
          role: 'EMPLOYEE',
          employeeEmpCode: empCode,
        });
      }

      return NextResponse.json(
        {
          message: 'Employee login ok',
          role: 'EMPLOYEE',
          empCode: employee.empCode,
          name: employee.name,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return NextResponse.json(
      { error: 'Server error while logging in' },
      { status: 500 }
    );
  }
}
