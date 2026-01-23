/**
 * Standardized API Response Utilities
 * 
 * All API responses follow this format:
 * {
 *   success: boolean,
 *   message: string,
 *   data: object | null,
 *   error: string | null,
 *   meta?: object
 * }
 */

import { NextResponse } from 'next/server';

/**
 * Create a successful response
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {object} meta - Optional metadata (pagination, etc.)
 * @returns {NextResponse}
 */
export function successResponse(data, message = 'Success', statusCode = 200, meta = null) {
  const response = {
    success: true,
    message,
    data,
    error: null,
  };

  if (meta) {
    response.meta = meta;
  }

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create an error response
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {object} meta - Optional metadata
 * @returns {NextResponse}
 */
export function errorResponse(error, statusCode = 500, meta = null) {
  const response = {
    success: false,
    message: error,
    data: null,
    error,
  };

  if (meta) {
    response.meta = meta;
  }

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Create a response from an error object (works with AppError and standard errors)
 * @param {Error} err - Error object
 * @param {object} req - Request object (optional, for logging)
 * @returns {NextResponse}
 */
export function errorResponseFromException(err, req = null) {
  // Log error with context
  console.error('API Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req?.url,
    method: req?.method,
    timestamp: new Date().toISOString(),
    name: err.name,
  });

  // Handle custom AppError classes
  if (err.statusCode) {
    return errorResponse(
      err.message,
      err.statusCode,
      err.details ? { details: err.details } : null
    );
  }

  // Handle MongoDB duplicate key errors
  if (err.name === 'MongoServerError') {
    if (err.code === 11000 || err.code === 11001) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return errorResponse(
        `${field} already exists. Duplicate entry.`,
        409
      );
    }
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = err.errors && typeof err.errors === 'object'
      ? Object.values(err.errors).map((e) => ({
          field: e?.path || 'unknown',
          message: e?.message || 'Validation error',
        }))
      : [{ field: 'unknown', message: 'Validation failed' }];
    
    return errorResponse(
      'Validation failed',
      400,
      { details: errors }
    );
  }

  // Handle Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return errorResponse(
      `Invalid ${err.path}: ${err.value}`,
      400
    );
  }

  // Generic error (don't expose internal details in production)
  return errorResponse(
    process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    500
  );
}

/**
 * HTTP Status Code Constants
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};
