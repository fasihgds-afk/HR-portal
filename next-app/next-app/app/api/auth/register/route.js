// next-app/app/api/auth/register/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import Employee from '@/models/Employee';
import bcrypt from 'bcryptjs';
import { asyncHandler, ValidationError, NotFoundError } from '@/lib/errors/errorHandler';
import { rateLimiters } from '@/lib/middleware/rateLimit';
import { z } from 'zod';

// Validation schema for user registration
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['HR', 'EMPLOYEE', 'ADMIN'], {
    errorMap: () => ({ message: 'Invalid role. Use HR, EMPLOYEE, or ADMIN.' }),
  }),
  empCode: z.string().optional(),
});

export async function POST(req) {
  // Apply strict rate limiting for auth endpoints
  const rateLimitResponse = await rateLimiters.auth(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    const body = await req.json();
    
    // Validate input
    let validated;
    try {
      validated = registerSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Validation failed', error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })));
      }
      throw error;
    }

    const { email, password, role, empCode } = validated;

    // Note: Secret key requirement removed - HR can now directly create HR users

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
        throw new NotFoundError(`Employee with empCode ${empCode}`);
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
    const { handleError } = await import('@/lib/errors/errorHandler');
    return handleError(err, req);
  }
}
