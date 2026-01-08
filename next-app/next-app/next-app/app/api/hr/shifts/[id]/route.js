// app/api/hr/shifts/[id]/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/db';
import Shift from '../../../../../models/Shift';

export const dynamic = 'force-dynamic';

// GET /api/hr/shifts/[id] - Get a specific shift
export async function GET(req, { params }) {
  try {
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    const shift = await Shift.findById(id).lean();

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    return NextResponse.json({ shift });
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
    console.log('PUT /api/hr/shifts/[id] - Updating shift:', id);

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

    console.log('Updating shift with:', { id, update });

    const shift = await Shift.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();

    if (!shift) {
      console.error('Shift not found with ID:', id);
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    console.log('Shift updated successfully:', shift._id);
    return NextResponse.json({ shift });
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

// DELETE /api/hr/shifts/[id] - Delete a shift (soft delete by setting isActive to false)
export async function DELETE(req, { params }) {
  try {
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    const shift = await Shift.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    return NextResponse.json({ shift, message: 'Shift deactivated successfully' });
  } catch (err) {
    console.error('DELETE /api/hr/shifts/[id] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

