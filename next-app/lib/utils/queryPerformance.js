// next-app/lib/utils/queryPerformance.js

/**
 * Performance monitoring utilities for database queries
 * Use in development to verify index usage
 */

/**
 * Explain a query to see if indexes are being used
 * @param {Object} query - Mongoose query
 * @returns {Object} Query execution plan
 */
export async function explainQuery(query) {
  if (process.env.NODE_ENV === 'production') {
    // Don't run explain in production (it's expensive)
    return null;
  }

  try {
    const explain = await query.explain('executionStats');
    return {
      executionStats: explain.executionStats,
      winningPlan: explain.queryPlanner?.winningPlan,
      rejectedPlans: explain.queryPlanner?.rejectedPlans,
    };
  } catch (err) {
    console.error('Query explain error:', err);
    return null;
  }
}

/**
 * Log slow queries (queries taking longer than threshold)
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {number} threshold - Threshold in milliseconds (default: 2000ms for production)
 */
export function logSlowQuery(operation, duration, threshold = 2000) {
  // In production, be more lenient with warnings (network latency, large collections)
  // In development, use stricter threshold to catch real issues
  const actualThreshold = process.env.NODE_ENV === 'production' ? 3000 : 1000;
  
  if (duration > actualThreshold) {
    console.warn(`⚠️ Slow query detected: ${operation} took ${duration}ms`);
    
    // In development, provide more context
    if (process.env.NODE_ENV === 'development') {
      console.warn(`   Consider: checking index usage, reducing projection, or increasing cache TTL`);
    }
  }
}

/**
 * Wrap a query with performance monitoring
 * @param {Function} queryFn - Query function
 * @param {string} operationName - Name of the operation
 * @returns {Promise} Query result
 */
export async function monitorQuery(queryFn, operationName) {
  const start = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - start;
    logSlowQuery(operationName, duration);
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`Query failed after ${duration}ms: ${operationName}`, err);
    throw err;
  }
}

