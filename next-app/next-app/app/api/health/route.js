// next-app/app/api/health/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/**
 * Health Check Endpoint
 * Returns system health status for monitoring and load balancers
 */
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  try {
    // Check database connection
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
      readyState: dbState,
    };

    // Check memory usage
    const memUsage = process.memoryUsage();
    health.services.memory = {
      status: 'healthy',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    };

    // Check cache (if using Redis, check connection here)
    health.services.cache = {
      status: 'healthy', // Update if using Redis
      type: 'memory',
    };

    // Overall status
    const allHealthy = Object.values(health.services).every(
      (s) => s.status === 'healthy'
    );
    health.status = allHealthy ? 'healthy' : 'degraded';

    return NextResponse.json(health, {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    health.status = 'unhealthy';
    health.error = err.message;
    health.services.database = {
      status: 'unhealthy',
      error: err.message,
    };

    return NextResponse.json(health, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}

