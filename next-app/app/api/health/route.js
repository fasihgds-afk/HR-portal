// Health check endpoint to verify API routes are working on Vercel
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check environment variables
    const hasMongoUri = !!process.env.MONGO_URI;
    const nodeEnv = process.env.NODE_ENV;
    
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: nodeEnv,
      hasMongoUri,
      message: hasMongoUri 
        ? 'API is working. MONGO_URI is set.' 
        : 'API is working but MONGO_URI is missing!',
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err.message,
      },
      { status: 500 }
    );
  }
}
