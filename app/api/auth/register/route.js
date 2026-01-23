// next-app/app/api/auth/register/route.js
import { connectDB } from '../../../lib/db';
import User from '../../../models/User';
import Employee from '../../../models/Employee';
import bcrypt from 'bcryptjs';
import { ValidationError, NotFoundError } from '../../../lib/errors/errorHandler';
import { rateLimiters } from '../../../lib/middleware/rateLimit';
import { z } from 'zod';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../lib/api/response';

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
        // Safely handle errors array - ensure it exists and is an array
        const errors = (error.errors && Array.isArray(error.errors)) 
          ? error.errors.map(e => ({
              field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
              message: e.message || 'Validation error',
            }))
          : [{ field: 'unknown', message: 'Validation failed' }];
        
        throw new ValidationError('Validation failed', errors);
      }
      throw error;
    }

    const { email, password, role, empCode } = validated;

    // Note: Secret key requirement removed - HR can now directly create HR users

    // For EMPLOYEE users, require valid empCode that exists in Employee collection
    let employeeDoc = null;
    if (role === 'EMPLOYEE') {
      if (!empCode) {
        throw new ValidationError('empCode is required for EMPLOYEE role');
      }

      employeeDoc = await Employee.findOne({ empCode }).lean();
      if (!employeeDoc) {
        throw new NotFoundError(`Employee with empCode ${empCode}`);
      }
    }

    // Check if email already exists
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      throw new ValidationError('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email,
      passwordHash,
      role,
      employeeEmpCode: role === 'EMPLOYEE' ? employeeDoc.empCode : undefined,
    });

    return successResponse(
      {
        userId: newUser._id,
        role: newUser.role,
      },
      'User registered successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
