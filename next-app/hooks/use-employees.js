/**
 * useEmployees Hook
 * 
 * Custom React hook for fetching and managing employee data
 * Handles loading states, errors, and pagination
 */

import { useState, useEffect, useCallback } from 'react';
import { API_ROUTES } from '@/lib/constants/api-routes';

/**
 * Custom hook for fetching paginated employee list
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {string} options.search - Search term
 * @param {string} options.shift - Shift filter
 * @param {string} options.department - Department filter
 * @returns {Object} { employees, pagination, loading, error, refetch }
 */
export function useEmployees({
  page = 1,
  limit = 50,
  search = '',
  shift = '',
  department = '',
} = {}) {
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (search) params.set('search', search);
      if (shift) params.set('shift', shift);
      if (department) params.set('department', department);

      const response = await fetch(`${API_ROUTES.EMPLOYEES.BASE}?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch employees: ${response.statusText}`);
      }

      const data = await response.json();
      setEmployees(data.items || []);
      setPagination(data.pagination || pagination);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, shift, department]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees,
    pagination,
    loading,
    error,
    refetch: fetchEmployees,
  };
}

/**
 * Custom hook for fetching a single employee
 * @param {string} empCode - Employee code
 * @returns {Object} { employee, loading, error, refetch }
 */
export function useEmployee(empCode) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmployee = useCallback(async () => {
    if (!empCode) {
      setEmployee(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(API_ROUTES.EMPLOYEES.BY_CODE(empCode));
      
      if (!response.ok) {
        if (response.status === 404) {
          setEmployee(null);
          return;
        }
        throw new Error(`Failed to fetch employee: ${response.statusText}`);
      }

      const data = await response.json();
      setEmployee(data.employee || null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching employee:', err);
    } finally {
      setLoading(false);
    }
  }, [empCode]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  return {
    employee,
    loading,
    error,
    refetch: fetchEmployee,
  };
}

