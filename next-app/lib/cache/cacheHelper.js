/**
 * Cache Helper Utilities
 * 
 * Provides helper functions for generating cache keys and managing cache
 * across different API routes.
 */

import { defaultCache } from './memoryCache';

/**
 * Generate a cache key from URL parameters
 * @param {string} baseKey - Base cache key (e.g., 'employees')
 * @param {URLSearchParams} searchParams - URL search parameters
 * @returns {string} Cache key
 */
export function generateCacheKey(baseKey, searchParams) {
  const params = [];
  
  // Sort parameters for consistent keys
  const sortedParams = Array.from(searchParams.entries()).sort();
  
  for (const [key, value] of sortedParams) {
    if (value) {
      params.push(`${key}:${value}`);
    }
  }
  
  return params.length > 0 
    ? `${baseKey}:${params.join('|')}`
    : baseKey;
}

/**
 * Get cached data or fetch and cache
 * @param {string} cacheKey - Cache key
 * @param {Function} fetchFn - Function to fetch data if not cached
 * @param {number} ttl - Time to live in seconds (optional)
 * @returns {Promise<*>} Cached or fetched data
 */
export async function getOrSetCache(cacheKey, fetchFn, ttl = null) {
  // Try to get from cache
  const cached = defaultCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch data
  const data = await fetchFn();
  
  // Store in cache
  defaultCache.set(cacheKey, data, ttl);
  
  return data;
}

/**
 * Invalidate cache entries matching a pattern
 * @param {string} pattern - Pattern to match (e.g., 'monthly-attendance' will invalidate all monthly attendance caches)
 */
export function invalidateCache(pattern) {
  // Since we're using a simple Map, we need to check all keys for pattern matching
  // For production with Redis, you can use pattern matching
  
  if (!pattern) {
    return;
  }

  // Get all cache keys and check if they start with the pattern
  // Cache keys are stored in the Map, so we need to access the internal cache
  const cacheKeys = Array.from(defaultCache.cache.keys());
  
  // If pattern matches any key (exact or prefix), delete it
  const keysToDelete = cacheKeys.filter(key => {
    if (typeof key === 'string') {
      // Exact match or starts with pattern
      return key === pattern || key.startsWith(pattern + ':');
    }
    return false;
  });

  // Delete matching keys
  keysToDelete.forEach(key => {
    defaultCache.delete(key);
  });

  // If no specific keys found but pattern is provided, try exact match
  if (keysToDelete.length === 0) {
    defaultCache.delete(pattern);
  }
}

/**
 * Invalidate all employee-related caches
 */
export function invalidateEmployeeCache() {
  // Clear all caches (simple approach)
  // In production with Redis, you'd invalidate only employee-related keys
  defaultCache.clear();
}

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  EMPLOYEES: 30,        // 30 seconds for general employee lists (filtered/paginated)
  EMPLOYEES_NO_FILTER_FIRST_PAGE: 120, // 2 minutes for the first page with no filters (most common query)
  EMPLOYEE_SINGLE: 300,  // 5 minutes
  DAILY_ATTENDANCE: 120, // 2 minutes
  MONTHLY_ATTENDANCE: 300, // 5 minutes
  SHIFTS: 600,          // 10 minutes
};

