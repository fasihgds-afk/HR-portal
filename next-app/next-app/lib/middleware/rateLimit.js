// next-app/lib/middleware/rateLimit.js
import { NextResponse } from 'next/server';

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based solution (e.g., @upstash/ratelimit)
 */

const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
export function rateLimit(maxRequests = 100, windowMs = 60000) {
  return async (req) => {
    // Get client IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
               req.headers.get('x-real-ip') || 
               req.ip || 
               'unknown';
    
    // Create unique key per IP and endpoint
    const endpoint = new URL(req.url).pathname;
    const key = `${ip}-${endpoint}`;
    
    const now = Date.now();
    const record = rateLimitMap.get(key);
    
    // First request or window expired
    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { 
        count: 1, 
        resetTime: now + windowMs 
      });
      return null; // Allow request
    }
    
    // Check if limit exceeded
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return NextResponse.json(
        { 
          error: 'Too many requests, please try again later',
          retryAfter,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
          },
        }
      );
    }
    
    // Increment counter
    record.count++;
    return null; // Allow request
  };
}

/**
 * Cleanup old entries periodically to prevent memory leaks
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Clean up every 5 minutes
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const rateLimiters = {
  // Strict rate limiting for auth endpoints
  auth: rateLimit(5, 60000), // 5 requests per minute
  
  // Moderate rate limiting for API endpoints
  api: rateLimit(100, 60000), // 100 requests per minute
  
  // Lenient rate limiting for read-only endpoints
  read: rateLimit(200, 60000), // 200 requests per minute
  
  // Very strict for write operations
  write: rateLimit(20, 60000), // 20 requests per minute
};

