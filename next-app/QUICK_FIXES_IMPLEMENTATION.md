# 🚀 Quick Fixes - Implementation Guide

This guide provides ready-to-use code for the most critical improvements.

## 1. Enhanced Database Connection (CRITICAL)

**File:** `next-app/lib/db.js`

Replace the entire file with:

```javascript
// next-app/lib/db.js
import mongoose from 'mongoose';

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGO_URI;
  if (!MONGODB_URI) {
    throw new Error('Please define MONGO_URI in .env.local');
  }

  if (cached.conn) {
    // Check if connection is still alive
    if (mongoose.connection.readyState === 1) {
      return cached.conn;
    }
    // Connection is dead, reset cache
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      retryWrites: true,
      retryReads: true,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongoose) => {
        // Connection event handlers
        mongoose.connection.on('error', (err) => {
          console.error('MongoDB connection error:', err);
          cached.conn = null;
          cached.promise = null;
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('MongoDB disconnected. Reconnecting...');
          cached.conn = null;
          cached.promise = null;
        });

        mongoose.connection.on('reconnected', () => {
          console.log('MongoDB reconnected');
        });

        if (!global.mongoLogged) {
          console.log(
            '✅ MongoDB connected:',
            MONGODB_URI.split('@')[1]?.split('/')[0] || '(no host part)'
          );
          global.mongoLogged = true;
        }

        return mongoose;
      })
      .catch((err) => {
        console.error('MongoDB connection failed:', err);
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}
```

## 2. Input Validation with Zod

**Step 1:** Install Zod
```bash
cd next-app
npm install zod
```

**Step 2:** Create validation schemas
**File:** `next-app/lib/validations/employee.js`

```javascript
import { z } from 'zod';

export const employeeSchema = z.object({
  empCode: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/i, 'Invalid employee code format'),
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().optional().or(z.literal('')),
  monthlySalary: z.number().min(0).max(10000000).optional(),
  shift: z.string().max(10).optional(),
  shiftId: z.string().optional(),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  phoneNumber: z.string().max(20).optional(),
  cnic: z.string().max(20).optional(),
  saturdayGroup: z.enum(['A', 'B']).optional(),
});

export const employeeUpdateSchema = employeeSchema.partial();

export function validateEmployee(data) {
  try {
    return { success: true, data: employeeSchema.parse(data) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      };
    }
    throw error;
  }
}
```

**Step 3:** Use in API route
**File:** `next-app/app/api/employee/route.js` (in POST handler)

```javascript
import { validateEmployee } from '@/lib/validations/employee';

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    
    // Validate input
    const validation = validateEmployee(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const validatedData = validation.data;
    // Use validatedData instead of body
    // ... rest of your code
  } catch (err) {
    // ... error handling
  }
}
```

## 3. Rate Limiting Middleware

**Step 1:** Install package
```bash
npm install @upstash/ratelimit @upstash/redis
```

**Or for simple in-memory (development only):**
```bash
npm install express-rate-limit
```

**Step 2:** Create rate limiter
**File:** `next-app/lib/middleware/rateLimit.js`

```javascript
// Simple in-memory rate limiter (for development)
// For production, use Redis-based solution

const rateLimitMap = new Map();

export function rateLimit(maxRequests = 100, windowMs = 60000) {
  return async (req) => {
    const ip = req.headers.get('x-forwarded-for') || 
               req.headers.get('x-real-ip') || 
               'unknown';
    
    const now = Date.now();
    const key = `${ip}-${req.url}`;
    
    const record = rateLimitMap.get(key);
    
    if (!record) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return null; // Allow request
    }
    
    if (now > record.resetTime) {
      // Window expired, reset
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return null;
    }
    
    if (record.count >= maxRequests) {
      // Rate limit exceeded
      return NextResponse.json(
        { error: 'Too many requests, please try again later' },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((record.resetTime - now) / 1000).toString(),
          },
        }
      );
    }
    
    record.count++;
    return null; // Allow request
  };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);
```

**Step 3:** Use in API routes
```javascript
import { rateLimit } from '@/lib/middleware/rateLimit';

export async function POST(req) {
  // Apply rate limiting
  const rateLimitResponse = await rateLimit(10, 60000)(req); // 10 requests per minute
  if (rateLimitResponse) return rateLimitResponse;
  
  // ... rest of your code
}
```

## 4. Enhanced Error Handling

**File:** `next-app/lib/errors/errorHandler.js`

```javascript
import { NextResponse } from 'next/server';

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

export function handleError(err, req) {
  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req?.url,
    method: req?.method,
    timestamp: new Date().toISOString(),
  });

  // Handle known errors
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
      return NextResponse.json(
        { error: 'Duplicate entry. This record already exists.' },
        { status: 409 }
      );
    }
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return NextResponse.json(
      { error: err.message, details: err.errors },
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

// Wrapper for async route handlers
export function asyncHandler(fn) {
  return async (req, ...args) => {
    try {
      return await fn(req, ...args);
    } catch (err) {
      return handleError(err, req);
    }
  };
}
```

**Usage in API routes:**
```javascript
import { asyncHandler, NotFoundError } from '@/lib/errors/errorHandler';

export const GET = asyncHandler(async (req) => {
  await connectDB();
  const employee = await Employee.findOne({ empCode });
  
  if (!employee) {
    throw new NotFoundError('Employee');
  }
  
  return NextResponse.json({ employee });
});
```

## 5. Health Check Endpoint

**File:** `next-app/app/api/health/route.js`

```javascript
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  try {
    // Check database
    await connectDB();
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    
    health.services.database = {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      state: dbStates[dbState] || 'unknown',
    };

    // Check cache (if using Redis, check connection)
    health.services.cache = {
      status: 'healthy', // Update if using Redis
    };

    // Overall status
    const allHealthy = Object.values(health.services).every(
      (s) => s.status === 'healthy'
    );
    health.status = allHealthy ? 'healthy' : 'degraded';

    return NextResponse.json(health, {
      status: allHealthy ? 200 : 503,
    });
  } catch (err) {
    health.status = 'unhealthy';
    health.error = err.message;
    health.services.database = {
      status: 'unhealthy',
      error: err.message,
    };

    return NextResponse.json(health, { status: 503 });
  }
}
```

## 6. Add Missing Database Indexes

**File:** `next-app/models/Employee.js`

Add after schema definition:
```javascript
// Performance indexes
EmployeeSchema.index({ department: 1, shift: 1 });
EmployeeSchema.index({ email: 1 });
EmployeeSchema.index({ shiftId: 1 });
```

**File:** `next-app/models/ShiftAttendance.js`

Add:
```javascript
ShiftAttendanceSchema.index({ empCode: 1, date: 1 });
ShiftAttendanceSchema.index({ date: 1, attendanceStatus: 1 });
ShiftAttendanceSchema.index({ empCode: 1, date: -1 }); // For recent attendance queries
```

**File:** `next-app/models/User.js`

Add:
```javascript
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ employeeEmpCode: 1 });
```

## 7. Request Timeout Wrapper

**File:** `next-app/lib/utils/timeout.js`

```javascript
export function withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// Usage:
// const result = await withTimeout(
//   Employee.find({}).lean(),
//   5000,
//   'Database query timed out'
// );
```

## 8. Structured Logging

**Step 1:** Install
```bash
npm install winston
```

**Step 2:** Create logger
**File:** `next-app/lib/logger.js`

```javascript
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'attendance-system' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Helper functions
export const log = {
  info: (message, meta = {}) => logger.info(message, meta),
  error: (message, error = null, meta = {}) => {
    logger.error(message, {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : null,
    });
  },
  warn: (message, meta = {}) => logger.warn(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
};
```

**Usage:**
```javascript
import { log } from '@/lib/logger';

log.info('Employee created', { empCode: '12345' });
log.error('Database error', err, { operation: 'createEmployee' });
```

---

## Implementation Order

1. ✅ Enhanced Database Connection (5 min)
2. ✅ Add Missing Indexes (10 min)
3. ✅ Health Check Endpoint (5 min)
4. ✅ Error Handling (15 min)
5. ✅ Input Validation (30 min)
6. ✅ Rate Limiting (20 min)
7. ✅ Structured Logging (15 min)

**Total Time:** ~1.5 hours for all critical fixes

---

## Testing Checklist

After implementing each fix:

- [ ] Database reconnects automatically after disconnection
- [ ] Invalid inputs are rejected with clear error messages
- [ ] Rate limiting prevents abuse
- [ ] Health check returns correct status
- [ ] Errors are logged properly
- [ ] Database queries are faster (check with indexes)

---

**Note:** These are production-ready implementations. Test thoroughly before deploying to production.

