// app/api/hr/shifts/route.js
import { connectDB } from '../../../../lib/db';
import Shift from '../../../../models/Shift';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OPTIMIZATION: Caching for static shifts data (60s revalidation)
export const revalidate = 60;

// GET /api/hr/shifts - Get all shifts
export async function GET(req) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // OPTIMIZATION: Direct query with index hint, fast timeout
    // Shifts are small dataset, query is fast with proper index
    const query = activeOnly ? { isActive: true } : {};
    const shifts = await Shift.find(query)
      .select('_id name code startTime endTime crossesMidnight gracePeriod description isActive')
      .sort({ code: 1 })
      .lean()
      .maxTimeMS(1500); // Reduced timeout for faster response

    // Shifts are static data - can be cached briefly (30 seconds) for Vercel edge caching
    return successResponse(
      { shifts },
      'Shifts retrieved successfully',
      HTTP_STATUS.OK,
      null,
      { isStatic: true, maxAge: 30 } // 30 seconds cache for Vercel edge
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// PATCH /api/hr/shifts - Bulk update shifts (e.g., activate all)
export async function PATCH(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { action } = body;

    if (action === 'activateAll') {
      // OPTIMIZATION: Use bulkWrite for better performance
      const result = await Shift.updateMany(
        { isActive: { $ne: true } }, // Only update inactive shifts
        { $set: { isActive: true } }
      )
        .maxTimeMS(3000);
      return NextResponse.json({
        message: `Activated ${result.modifiedCount} shift(s)`,
        modifiedCount: result.modifiedCount,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (err) {
    console.error('PATCH /api/hr/shifts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/hr/shifts - Create a new shift
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { name, code, startTime, endTime, crossesMidnight, gracePeriod, description } = body;

    if (!name || !code || !startTime || !endTime) {
      throw new ValidationError('name, code, startTime, and endTime are required');
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new ValidationError('startTime and endTime must be in HH:mm format');
    }

    // OPTIMIZATION: Create with validation in one operation
    const shift = await Shift.create({
      name,
      code: code.toUpperCase(),
      startTime,
      endTime,
      crossesMidnight: crossesMidnight || false,
      gracePeriod: gracePeriod || 15,
      description: description || '',
      isActive: true,
    });

    return successResponse(
      { shift },
      'Shift created successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

