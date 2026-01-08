// next-app/lib/validations/employee.js
import { z } from 'zod';

/**
 * Employee validation schemas
 */
export const employeeSchema = z.object({
  empCode: z.string()
    .min(1, 'Employee code is required')
    .max(20, 'Employee code must be 20 characters or less')
    .regex(/^[A-Z0-9]+$/i, 'Employee code must contain only letters and numbers'),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  monthlySalary: z.number()
    .min(0, 'Salary must be positive')
    .max(10000000, 'Salary exceeds maximum allowed')
    .optional(),
  shift: z.string()
    .max(10, 'Shift code must be 10 characters or less')
    .optional(),
  shiftId: z.string()
    .optional(),
  department: z.string()
    .max(100, 'Department must be 100 characters or less')
    .optional(),
  designation: z.string()
    .max(100, 'Designation must be 100 characters or less')
    .optional(),
  phoneNumber: z.string()
    .max(20, 'Phone number must be 20 characters or less')
    .regex(/^[0-9+\-\s()]*$/, 'Invalid phone number format')
    .optional(),
  cnic: z.string()
    .max(20, 'CNIC must be 20 characters or less')
    .optional(),
  saturdayGroup: z.enum(['A', 'B'])
    .optional(),
  profileImageBase64: z.string()
    .optional(),
  profileImageUrl: z.string()
    .url('Invalid image URL')
    .optional()
    .or(z.literal('')),
});

export const employeeUpdateSchema = employeeSchema.partial();

/**
 * Validate employee data
 * @param {Object} data - Employee data to validate
 * @param {boolean} isUpdate - Whether this is an update (partial validation)
 * @returns {Object} Validation result
 */
export function validateEmployee(data, isUpdate = false) {
  try {
    const schema = isUpdate ? employeeUpdateSchema : employeeSchema;
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      };
    }
    throw error;
  }
}

