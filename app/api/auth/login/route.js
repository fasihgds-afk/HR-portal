// next-app/app/api/auth/login/route.js
import { connectDB } from '../../../lib/db';
import User from '../../../models/User';
import Employee from '../../../models/Employee';
import bcrypt from 'bcryptjs';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../lib/api/response';
import { ValidationError, UnauthorizedError } from '../../../lib/errors/errorHandler';

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { role, email, password, empCode, cnic } = body;

    if (!role) {
      throw new ValidationError('role is required');
    }

    // HR login
    if (role === 'HR') {
      if (!email || !password) {
        throw new ValidationError('email and password are required for HR login');
      }

      const user = await User.findOne({ email, role: 'HR' }).lean();
      if (!user) {
        throw new UnauthorizedError('Invalid HR credentials');
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedError('Invalid HR credentials');
      }

      return successResponse(
        { role: 'HR' },
        'HR login successful',
        HTTP_STATUS.OK
      );
    }

    // Employee login
    if (role === 'EMPLOYEE') {
      if (!empCode || !cnic) {
        throw new ValidationError('empCode and cnic are required for employee login');
      }

      const employee = await Employee.findOne({ empCode, cnic }).lean();
      if (!employee) {
        throw new UnauthorizedError('Employee not found for given code + CNIC');
      }

      let user = await User.findOne({
        role: 'EMPLOYEE',
        employeeEmpCode: empCode,
      }).lean();

      // Optionally auto-create a User row once employee is verified
      if (!user) {
        user = await User.create({
          email: `${empCode}@auto.gds.local`,
          passwordHash: await bcrypt.hash(cnic, 10),
          role: 'EMPLOYEE',
          employeeEmpCode: empCode,
        });
      }

      return successResponse(
        {
          role: 'EMPLOYEE',
          empCode: employee.empCode,
          name: employee.name,
        },
        'Employee login successful',
        HTTP_STATUS.OK
      );
    }

    throw new ValidationError('Invalid role');
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
