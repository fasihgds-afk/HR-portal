// next-app/lib/errors/errorHandler.js
import { NextResponse } from 'next/server';

/**
 * Custom Application Error Classes
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * Centralized Error Handler
 * Handles all errors and returns appropriate responses
 */
export function handleError(err, req) {
  // Log error with context
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req?.url,
    method: req?.method,
    timestamp: new Date().toISOString(),
    name: err.name,
  });

  // Handle known application errors
  if (err instanceof AppError) {
    const response = {
      error: err.message,
    };
    
    if (err instanceof ValidationError && err.details) {
      response.details = err.details;
    }
    
    return NextResponse.json(response, { status: err.statusCode });
  }

  // Handle MongoDB errors
  if (err.name === 'MongoServerError') {
    if (err.code === 11000) {
      // Duplicate key error
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return NextResponse.json(
        { error: `${field} already exists. Duplicate entry.` },
        { status: 409 }
      );
    }
    if (err.code === 11001) {
      return NextResponse.json(
        { error: 'Duplicate entry. This record already exists.' },
        { status: 409 }
      );
    }
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 400 }
    );
  }

  // Handle Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return NextResponse.json(
      { error: `Invalid ${err.path}: ${err.value}` },
      { status: 400 }
    );
  }

  // Generic error (don't expose internal details in production)
  return NextResponse.json(
    {
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
    },
    { status: 500 }
  );
}

/**
 * Wrapper for async route handlers
 * Automatically catches errors and handles them
 */
export function asyncHandler(fn) {
  return async (req, ...args) => {
    try {
      return await fn(req, ...args);
    } catch (err) {
      return handleError(err, req);
    }
  };
}

