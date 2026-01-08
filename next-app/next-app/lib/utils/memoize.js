/**
 * Memoization Utilities
 * 
 * Provides memoization functions for expensive calculations
 */

/**
 * Simple memoization function
 * @param {Function} fn - Function to memoize
 * @param {Function} keyFn - Optional function to generate cache key from arguments
 * @returns {Function} Memoized function
 */
export function memoize(fn, keyFn = null) {
  const cache = new Map();
  
  return function(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoize with TTL (Time To Live)
 * @param {Function} fn - Function to memoize
 * @param {number} ttl - Time to live in milliseconds
 * @param {Function} keyFn - Optional function to generate cache key from arguments
 * @returns {Function} Memoized function with TTL
 */
export function memoizeWithTTL(fn, ttl = 60000, keyFn = null) {
  const cache = new Map();
  
  return function(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }
    
    const result = fn(...args);
    cache.set(key, { value: result, timestamp: Date.now() });
    return result;
  };
}

/**
 * Clear memoization cache
 * @param {Function} memoizedFn - Memoized function (must have _cache property)
 */
export function clearMemoCache(memoizedFn) {
  if (memoizedFn._cache) {
    memoizedFn._cache.clear();
  }
}

/**
 * Create a cache key from multiple values
 * @param {...any} values - Values to combine into a key
 * @returns {string} Cache key
 */
export function createCacheKey(...values) {
  return values.map(v => {
    if (v instanceof Date) {
      return v.toISOString();
    }
    if (typeof v === 'object' && v !== null) {
      return JSON.stringify(v);
    }
    return String(v);
  }).join('|');
}

