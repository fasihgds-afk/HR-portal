/**
 * API Route Constants
 * 
 * Centralized API endpoint paths for consistency across the application
 */

const API_BASE = '/api';

export const API_ROUTES = {
  // Authentication
  AUTH: {
    LOGIN: `${API_BASE}/auth/login`,
    REGISTER: `${API_BASE}/auth/register`,
    LOGOUT: `${API_BASE}/auth/logout`,
    SESSION: `${API_BASE}/auth/session`,
  },
  
  // Employees
  EMPLOYEES: {
    BASE: `${API_BASE}/employees`,
    BY_CODE: (empCode) => `${API_BASE}/employees?empCode=${empCode}`,
    ATTENDANCE: (empCode, month) => 
      `${API_BASE}/employee/attendance?empCode=${empCode}&month=${month}`,
  },
  
  // HR Endpoints
  HR: {
    EMPLOYEES: `${API_BASE}/hr/employees`,
    DAILY_ATTENDANCE: `${API_BASE}/hr/daily-attendance`,
    MONTHLY_ATTENDANCE: `${API_BASE}/hr/monthly-attendance`,
    SHIFTS: {
      BASE: `${API_BASE}/hr/shifts`,
      BY_ID: (id) => `${API_BASE}/hr/shifts/${id}`,
      MIGRATE: `${API_BASE}/hr/shifts/migrate`,
    },
    EMPLOYEE_SHIFTS: {
      BASE: `${API_BASE}/hr/employee-shifts`,
      AUTO_DETECT: `${API_BASE}/hr/employee-shifts/auto-detect`,
      BULK_CREATE: `${API_BASE}/hr/employee-shifts/bulk-create`,
    },
  },
  
  // Upload
  UPLOAD: `${API_BASE}/upload`,
};

Object.freeze(API_ROUTES);

/**
 * Helper to build query string for API routes
 */
export function buildQueryString(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

