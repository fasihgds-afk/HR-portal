/**
 * Employee Service
 * 
 * Business logic for employee-related operations
 * Separated from API routes for better testability and reusability
 */

import Employee from '@/models/Employee';
import { buildEmployeeFilter, getEmployeeProjection } from '@/lib/database/query-optimizer';

/**
 * Get a single employee by employee code
 * @param {string} empCode - Employee code
 * @param {boolean} includeImages - Whether to include image fields
 * @returns {Promise<Object|null>} Employee object or null if not found
 */
export async function getEmployeeByCode(empCode, includeImages = true) {
  if (!empCode) {
    throw new Error('Employee code is required');
  }

  const projection = getEmployeeProjection(includeImages);
  const employee = await Employee.findOne({ empCode }, projection).lean();
  
  return employee;
}

/**
 * Get paginated list of employees with optional filters
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 50)
 * @param {string} options.search - Search term (name, code, email)
 * @param {string} options.shift - Filter by shift
 * @param {string} options.department - Filter by department
 * @returns {Promise<Object>} Paginated employee list with metadata
 */
export async function getEmployees({
  page = 1,
  limit = 50,
  search = '',
  shift = '',
  department = '',
} = {}) {
  const filter = buildEmployeeFilter({ search, shift, department });
  const projection = getEmployeeProjection(false); // Exclude base64 images for lists
  
  const skip = (page - 1) * limit;
  
  const [total, employees] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.find(filter, projection)
      .sort({ empCode: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: employees,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Create or update an employee (upsert)
 * @param {Object} employeeData - Employee data
 * @param {string} employeeData.empCode - Employee code (required)
 * @returns {Promise<Object>} Created/updated employee
 */
export async function upsertEmployee(employeeData) {
  const { empCode, ...updateFields } = employeeData;

  if (!empCode) {
    throw new Error('Employee code is required');
  }

  const update = {};
  
  // Only include defined fields
  const allowedFields = [
    'name', 'email', 'monthlySalary', 'shift', 'department', 'designation',
    'phoneNumber', 'cnic', 'profileImageBase64', 'profileImageUrl', 'shiftId', 'saturdayGroup'
  ];
  
  allowedFields.forEach(field => {
    if (updateFields[field] !== undefined) {
      update[field] = updateFields[field];
    }
  });

  // Ensure salary is a number
  if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
    const numSalary = Number(update.monthlySalary);
    if (!Number.isNaN(numSalary)) {
      update.monthlySalary = numSalary;
    }
  }

  const employee = await Employee.findOneAndUpdate(
    { empCode },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return employee;
}

/**
 * Delete an employee by employee code
 * @param {string} empCode - Employee code
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteEmployee(empCode) {
  if (!empCode) {
    throw new Error('Employee code is required');
  }

  const result = await Employee.deleteOne({ empCode });
  return result.deletedCount > 0;
}

/**
 * Get all employees (for dropdowns, selects, etc.)
 * @param {Object} options - Query options
 * @param {Array<string>} options.fields - Fields to select
 * @returns {Promise<Array>} Array of employees
 */
export async function getAllEmployees(options = {}) {
  const { fields = 'empCode name email shift department' } = options;
  
  const employees = await Employee.find()
    .select(fields)
    .sort({ empCode: 1 })
    .lean();

  return employees;
}

