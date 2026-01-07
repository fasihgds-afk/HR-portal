/**
 * User Role Constants
 * 
 * Centralized definitions of user roles and permissions
 */

export const USER_ROLES = {
  HR: 'HR',
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
};

Object.freeze(USER_ROLES);

/**
 * Check if a role has admin privileges
 */
export function isAdminRole(role) {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.HR;
}

/**
 * Check if a role can access HR features
 */
export function canAccessHR(role) {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.HR;
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role) {
  const displayNames = {
    [USER_ROLES.HR]: 'Human Resources',
    [USER_ROLES.ADMIN]: 'Administrator',
    [USER_ROLES.EMPLOYEE]: 'Employee',
  };
  return displayNames[role] || role;
}

