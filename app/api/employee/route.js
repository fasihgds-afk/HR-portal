// app/api/employee/route.js
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';
import { buildEmployeeFilter, getEmployeeProjection } from '../../../lib/db/queryOptimizer';
import { NotFoundError, ValidationError } from '../../../lib/errors/errorHandler';
import { validateEmployee } from '../../../lib/validations/employee';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../lib/api/response';

// SIMPLE APPROACH - No caching, no wrappers, no monitoring - just direct Mongoose queries with .lean()
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs'; // Explicitly set runtime for Vercel
export const fetchCache = 'force-no-store'; // Disable fetch caching

// Helper function to convert ObjectId shift to shift code
async function normalizeShiftField(shiftValue) {
  if (!shiftValue) return '';
  
  const shiftString = String(shiftValue).trim();
  if (!shiftString) return '';
  
  // Check if shift is an ObjectId (24 hex characters)
  if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
    // Import Shift model to look up shift code
    const Shift = (await import('../../../models/Shift')).default;
    const shiftDoc = await Shift.findById(shiftString).lean();
    
    if (shiftDoc && shiftDoc.code) {
      return shiftDoc.code;
    }
    // ObjectId doesn't match any shift, return empty
    return '';
  }
  
  // Shift is already a code, normalize to uppercase
  return shiftString.toUpperCase();
}

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    
    // Employee API Query params

    // If empCode is provided → return single employee (used by employee dashboard)
    if (empCode) {
      // SIMPLE: Use Mongoose with .select() and .lean() - execute immediately
      const projection = getEmployeeProjection(true);
      const employee = await Employee.findOne({ empCode })
        .select(projection)
        .lean();
      
      if (!employee) {
        throw new NotFoundError(`Employee ${empCode}`);
      }
      
      // Normalize shift field: convert ObjectId to shift code if needed
      if (employee.shift) {
        employee.shift = await normalizeShiftField(employee.shift);
      }
      
      return successResponse(
        { employee },
        'Employee retrieved successfully',
        HTTP_STATUS.OK
      );
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = (searchParams.get('search') || '').trim();
    let shift = (searchParams.get('shift') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    
    // Normalize "All Shifts" - empty string means all shifts
    if (shift === 'All Shifts' || shift === 'all shifts') {
      shift = '';
    }

    // Build filter
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    const skip = (page - 1) * limit;
    
    // Use direct Mongoose queries instead of aggregation for simplicity and reliability
    // Aggregation can have issues in serverless environments
    const queryFilter = Object.keys(filter).length > 0 ? filter : {};
    
    // Log filter for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee API] Query filter:', queryFilter);
    }
    
    // Get projection from helper (consistent with other queries)
    const listProjection = getEmployeeProjection(false);
    
    // OPTIMIZATION: Run find and countDocuments in parallel for faster response
    // Also add maxTimeMS to prevent slow queries from hanging
    const [employees, total] = await Promise.all([
      Employee.find(queryFilter)
        .select(listProjection)
        .sort(sortOptions || { empCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(5000) // Timeout after 5 seconds
        .exec(),
      Employee.countDocuments(queryFilter)
        .maxTimeMS(5000) // Timeout after 5 seconds
        .exec()
    ]);
    
    // OPTIMIZATION: Batch shift lookups instead of sequential queries (N+1 problem fix)
    // Collect all unique shift ObjectIds that need to be resolved
    const shiftObjectIds = new Set();
    const shiftMap = new Map(); // Map ObjectId -> shift code
    
    for (const emp of employees) {
      if (emp.shift) {
        const shiftString = String(emp.shift).trim();
        // Check if it's an ObjectId (24 hex characters)
        if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
          shiftObjectIds.add(shiftString);
        }
      }
    }
    
    // OPTIMIZATION: Batch fetch all shifts in one query (use cached shifts if available)
    if (shiftObjectIds.size > 0) {
      const { getCachedShifts } = await import('../../../lib/cache/shiftCache');
      let allCachedShifts = getCachedShifts(false); // Get all shifts from cache
      
      if (allCachedShifts) {
        // Use cached shifts - filter to only the ones we need
        const neededShifts = allCachedShifts.filter(s => 
          shiftObjectIds.has(s._id.toString())
        );
        for (const shift of neededShifts) {
          shiftMap.set(shift._id.toString(), shift.code);
        }
      } else {
        // Cache miss - fetch from database
        const Shift = (await import('../../../models/Shift')).default;
        const shifts = await Shift.find({ 
          _id: { $in: Array.from(shiftObjectIds) } 
        })
          .select('_id code')
          .lean();
        
        // Build map for fast lookup
        for (const shift of shifts) {
          shiftMap.set(shift._id.toString(), shift.code);
        }
      }
    }
    
    // Now normalize shift fields using the pre-fetched map
    for (const emp of employees) {
      if (emp.shift) {
        const shiftString = String(emp.shift).trim();
        if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
          // It's an ObjectId - use the map
          emp.shift = shiftMap.get(shiftString) || '';
        } else {
          // It's already a code - normalize to uppercase
          emp.shift = shiftString.toUpperCase();
        }
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      // Employee API Query result
    }

    return successResponse(
      { items: employees || [] },
      'Employees retrieved successfully',
      HTTP_STATUS.OK,
      {
        pagination: {
          page,
          limit,
          total: total || 0,
          totalPages: Math.ceil((total || 0) / limit),
        },
      }
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    
    // Validate input
    const validation = validateEmployee(body, true);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const validatedData = validation.data;
    const { empCode } = validatedData;

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Build update object
    const update = {};
    Object.keys(validatedData).forEach((key) => {
      if (validatedData[key] !== undefined && key !== 'empCode') {
        update[key] = validatedData[key];
      }
    });

    if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
      update.monthlySalary = Number(update.monthlySalary);
    }

    // Handle shift field: Convert ObjectId to shift code if needed
    if (update.shift) {
      const shiftValue = String(update.shift).trim();
      
      // Check if shift is an ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(shiftValue)) {
        // Import Shift model to look up shift code
        const Shift = (await import('../../../models/Shift')).default;
        const shiftDoc = await Shift.findById(shiftValue).lean();
        
        if (shiftDoc && shiftDoc.code) {
          // Replace ObjectId with shift code
          update.shift = shiftDoc.code;
          // Also update shiftId if it's different
          update.shiftId = shiftDoc._id;
        } else {
          // ObjectId doesn't match any shift, clear it
          console.warn(`[Employee API] Shift ObjectId ${shiftValue} not found, clearing shift for employee ${empCode}`);
          update.shift = '';
          update.shiftId = null;
        }
      } else {
        // Shift is already a code (like 'D1', 'N1'), normalize to uppercase
        update.shift = shiftValue.toUpperCase();
        
        // Try to find and set shiftId if shift code is provided
        const Shift = (await import('../../../models/Shift')).default;
        const shiftDoc = await Shift.findOne({ code: update.shift }).lean();
        if (shiftDoc) {
          update.shiftId = shiftDoc._id;
        }
      }
    }

    // Execute update directly
    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const isNew = !employee.createdAt || new Date(employee.createdAt).getTime() > Date.now() - 1000;
    
    return successResponse(
      { employee },
      isNew ? 'Employee created successfully' : 'Employee updated successfully',
      isNew ? HTTP_STATUS.CREATED : HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// DELETE /api/employee?empCode=XXXXX
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    const deleted = await Employee.findOneAndDelete({ empCode });

    if (!deleted) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    return successResponse(
      { employee: deleted },
      `Employee ${empCode} deleted successfully`,
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
