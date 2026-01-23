// app/api/hr/shifts/route.js
import { connectDB } from '../../../../lib/db';
import Shift from '../../../../models/Shift';
import { getCachedShifts, setCachedShifts, invalidateShiftsCache } from '../../../../lib/cache/shiftCache';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const dynamic = 'force-dynamic';

// GET /api/hr/shifts - Get all shifts
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // OPTIMIZATION: Use cache for shifts (static data, rarely changes)
    // Cache is invalidated on any CRUD operation, so data stays fresh
    let shifts = getCachedShifts(activeOnly);
    
    if (!shifts) {
      await connectDB();
      
      const query = activeOnly ? { isActive: true } : {};
      shifts = await Shift.find(query).sort({ code: 1 }).lean();
      
      // Cache all shifts (we'll filter activeOnly from cache if needed)
      if (!activeOnly) {
        setCachedShifts(shifts);
      } else {
        // If activeOnly was requested, cache all shifts anyway for future use
        const allShifts = await Shift.find({}).sort({ code: 1 }).lean();
        setCachedShifts(allShifts);
        shifts = allShifts.filter(s => s.isActive);
      }
    }

    return successResponse(
      { shifts },
      'Shifts retrieved successfully',
      HTTP_STATUS.OK
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
      const result = await Shift.updateMany(
        {},
        { $set: { isActive: true } }
      );
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

    // Invalidate cache after creating shift
    invalidateShiftsCache();

    return successResponse(
      { shift },
      'Shift created successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

