/**
 * Simple In-Memory Cache Utility
 * 
 * Provides basic caching for API responses to improve performance.
 * This is a simple implementation - for production, consider Redis.
 * 
 * Usage:
 *   const cache = new MemoryCache(300); // 5 minutes TTL
 *   cache.set('key', data);
 *   const data = cache.get('key');
 */

export class MemoryCache {
  constructor(defaultTTL = 300) {
    // defaultTTL in seconds (default: 5 minutes)
    this.cache = new Map();
    this.defaultTTL = defaultTTL * 1000; // Convert to milliseconds
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional, uses default if not provided)
   */
  set(key, value, ttl = null) {
    const expiration = Date.now() + (ttl ? ttl * 1000 : this.defaultTTL);
    this.cache.set(key, {
      value,
      expiration,
    });
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiration) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (Date.now() > item.expiration) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiration) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.cache.size;
  }
}

// Export a singleton instance for easy use
export const defaultCache = new MemoryCache(300); // 5 minutes default TTL

