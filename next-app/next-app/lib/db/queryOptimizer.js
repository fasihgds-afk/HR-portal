/**
 * Database Query Optimization Utilities
 * 
 * Provides helper functions to optimize common query patterns
 */

/**
 * Optimize Employee search query
 * Uses text index for better performance, falls back to regex for specific cases
 * 
 * @param {string} searchTerm - Search term
 * @returns {Object} MongoDB query filter
 */
export function optimizeEmployeeSearch(searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const trimmed = searchTerm.trim();
  
  // If search term is numeric, likely searching for empCode (exact match is fastest)
  if (/^\d+$/.test(trimmed)) {
    return { empCode: trimmed };
  }

  // If search term looks like email, use exact match or prefix match (faster than regex)
  if (trimmed.includes('@')) {
    // Try exact match first (uses index), fallback to case-insensitive regex
    return { 
      $or: [
        { email: trimmed },
        { email: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } }
      ]
    };
  }

  // For general text search, use indexed fields with case-insensitive regex
  // This is more reliable than $text search which requires specific index setup
  // Using indexed fields (empCode, email) with regex is still faster than unindexed fields
  return {
    $or: [
      { empCode: { $regex: trimmed, $options: 'i' } }, // Uses empCode index
      { name: { $regex: trimmed, $options: 'i' } },
      { email: { $regex: trimmed, $options: 'i' } }, // Uses email index
    ],
  };
}

/**
 * Build optimized filter for Employee queries
 * 
 * @param {Object} params - Filter parameters
 * @param {string} params.search - Search term
 * @param {string} params.shift - Shift filter
 * @param {string} params.department - Department filter
 * @returns {Object} MongoDB query filter and sort options
 */
export function buildEmployeeFilter({ search, shift, department }) {
  const filter = {};
  const sortOptions = { empCode: 1 }; // Always sort by empCode (indexed)

  // Add search filter
  if (search) {
    const searchFilter = optimizeEmployeeSearch(search);
    
    if (searchFilter.$or) {
      filter.$or = searchFilter.$or;
    } else {
      Object.assign(filter, searchFilter);
    }
  }

  // Add shift filter (uses shift index)
  if (shift) {
    filter.shift = shift;
  }

  // Add department filter (uses department index)
  if (department) {
    filter.department = department;
  }

  return { filter, sortOptions };
}

/**
 * Get optimized projection for Employee queries
 * Excludes large fields like base64 images when not needed
 * 
 * @param {boolean} includeImages - Whether to include image fields
 * @returns {Object} MongoDB projection
 */
export function getEmployeeProjection(includeImages = false) {
  // MongoDB inclusion projection - only specified fields are returned
  // Timestamps (createdAt, updatedAt) are automatically excluded when not in the list
  const projection = {
    _id: 1, // Always include _id (required by MongoDB)
    empCode: 1,
    name: 1,
    email: 1,
    monthlySalary: 1,
    shift: 1,
    shiftId: 1,
    department: 1,
    designation: 1,
    phoneNumber: 1,
    cnic: 1,
    saturdayGroup: 1,
    // Note: createdAt and updatedAt are NOT included, so they won't be returned
  };

  if (includeImages) {
    projection.profileImageBase64 = 1;
    projection.profileImageUrl = 1;
  } else {
    projection.profileImageUrl = 1; // Include URL but not base64
  }

  return projection;
}

/**
 * Optimize date range query for ShiftAttendance
 * 
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} empCode - Optional employee code
 * @returns {Object} MongoDB query filter
 */
export function buildShiftAttendanceDateRangeFilter(startDate, endDate, empCode = null) {
  const filter = {
    date: { $gte: startDate, $lte: endDate },
  };

  if (empCode) {
    filter.empCode = empCode;
  }

  return filter;
}

/**
 * Get optimized projection for ShiftAttendance queries
 * 
 * @returns {Object} MongoDB projection
 */
export function getShiftAttendanceProjection() {
  return {
    date: 1,
    empCode: 1,
    checkIn: 1,
    checkOut: 1,
    shift: 1,
    attendanceStatus: 1,
    reason: 1,
    excused: 1,
    lateExcused: 1,
    earlyExcused: 1,
    late: 1,
    earlyLeave: 1,
    totalPunches: 1,
    _id: 0,
  };
}

/**
 * Optimize AttendanceEvent query for date range
 * 
 * @param {Date} startTime - Start time
 * @param {Date} endTime - End time
 * @param {string} empCode - Optional employee code
 * @param {number} minor - Optional minor code filter
 * @returns {Object} MongoDB query filter
 */
export function buildAttendanceEventFilter(startTime, endTime, empCode = null, minor = null) {
  const filter = {
    eventTime: { $gte: startTime, $lte: endTime },
  };

  if (empCode) {
    filter.empCode = empCode;
  }

  if (minor !== null) {
    filter.minor = minor;
  }

  return filter;
}

