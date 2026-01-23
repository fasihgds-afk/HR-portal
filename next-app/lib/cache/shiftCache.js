// lib/cache/shiftCache.js
// Minimal caching for shifts (static data) with proper invalidation on CRUD operations

let shiftsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes - shifts rarely change

/**
 * Get cached shifts or null if cache is invalid
 */
export function getCachedShifts(activeOnly = false) {
  if (!shiftsCache || !cacheTimestamp) {
    return null;
  }
  
  // Check if cache is expired
  if (Date.now() - cacheTimestamp > CACHE_TTL) {
    shiftsCache = null;
    cacheTimestamp = null;
    return null;
  }
  
  // Filter by activeOnly if needed
  if (activeOnly) {
    return shiftsCache.filter(s => s.isActive);
  }
  
  return shiftsCache;
}

/**
 * Set cached shifts
 */
export function setCachedShifts(shifts) {
  shiftsCache = shifts;
  cacheTimestamp = Date.now();
}

/**
 * Invalidate shifts cache (call this on any CRUD operation)
 */
export function invalidateShiftsCache() {
  shiftsCache = null;
  cacheTimestamp = null;
}
