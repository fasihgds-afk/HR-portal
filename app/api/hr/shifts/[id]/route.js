// app/api/hr/shifts/[id]/route.js
import { connectDB } from '../../../../../lib/db';
import Shift from '../../../../../models/Shift';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { NotFoundError, ValidationError } from '../../../../../lib/errors/errorHandler';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/hr/shifts/[id] - Get a specific shift
export async function GET(req, { params }) {
  try {
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    // OPTIMIZATION: Select only required fields, add timeout
    const shift = await Shift.findById(id)
      .select('_id name code startTime endTime crossesMidnight gracePeriod description isActive')
      .lean()
      .maxTimeMS(2000);

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // OPTIMIZATION: Add cache headers for static shift data
    const response = NextResponse.json({ shift });
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return response;
  } catch (err) {
    console.error('GET /api/hr/shifts/[id] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/hr/shifts/[id] - Update a shift
export async function PUT(req, { params }) {
  try {
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    // Updating shift

    if (!id) {
      return NextResponse.json(
        { error: 'Shift ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, code, startTime, endTime, crossesMidnight, gracePeriod, description, isActive } = body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (code !== undefined) update.code = code.toUpperCase();
    if (startTime !== undefined) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime)) {
        return NextResponse.json(
          { error: 'startTime must be in HH:mm format' },
          { status: 400 }
        );
      }
      update.startTime = startTime;
    }
    if (endTime !== undefined) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(endTime)) {
        return NextResponse.json(
          { error: 'endTime must be in HH:mm format' },
          { status: 400 }
        );
      }
      update.endTime = endTime;
    }
    if (crossesMidnight !== undefined) update.crossesMidnight = crossesMidnight;
    if (gracePeriod !== undefined) update.gracePeriod = gracePeriod;
    if (description !== undefined) update.description = description;
    if (isActive !== undefined) update.isActive = isActive;

    // OPTIMIZATION: Use lean() and select only required fields
    const shift = await Shift.findByIdAndUpdate(
      id, 
      { $set: update }, 
      { new: true, runValidators: true }
    )
      .select('_id name code startTime endTime crossesMidnight gracePeriod description isActive')
      .lean()
      .maxTimeMS(3000);

    if (!shift) {
      console.error('Shift not found with ID:', id);
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // OPTIMIZATION: Add cache headers for static shift data
    const response = NextResponse.json({ shift });
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return response;
  } catch (err) {
    console.error('PUT /api/hr/shifts/[id] error:', err);
    if (err.name === 'CastError' || err.message?.includes('Cast to ObjectId')) {
      return NextResponse.json(
        { error: 'Invalid shift ID format' },
        { status: 400 }
      );
    }
    if (err.code === 11000) {
      return NextResponse.json(
        { error: 'Shift with this name or code already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/hr/shifts/[id] - Delete a shift
// Query param: ?permanent=true for permanent deletion, otherwise soft delete (deactivate)
export async function DELETE(req, { params }) {
  try {
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    
    // Check if permanent deletion is requested
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';
    
    if (permanent) {
      // Permanent deletion - remove from database
      const shift = await Shift.findByIdAndDelete(id).lean();

      if (!shift) {
        throw new NotFoundError('Shift');
      }

      return successResponse(
        { shift },
        'Shift permanently deleted successfully',
        HTTP_STATUS.OK
      );
    } else {
      // Soft delete - set isActive to false
      const shift = await Shift.findByIdAndUpdate(
        id,
        { $set: { isActive: false } },
        { new: true }
      ).lean();

      if (!shift) {
        throw new NotFoundError('Shift');
      }

      return successResponse(
        { shift },
        'Shift deactivated successfully',
        HTTP_STATUS.OK
      );
    }
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

