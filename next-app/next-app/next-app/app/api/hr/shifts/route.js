// app/api/hr/shifts/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import Shift from '../../../../models/Shift';

export const dynamic = 'force-dynamic';

// GET /api/hr/shifts - Get all shifts
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const query = activeOnly ? { isActive: true } : {};
    const shifts = await Shift.find(query).sort({ code: 1 }).lean();

    return NextResponse.json({ shifts });
  } catch (err) {
    console.error('GET /api/hr/shifts error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'name, code, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return NextResponse.json(
        { error: 'startTime and endTime must be in HH:mm format' },
        { status: 400 }
      );
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

    return NextResponse.json({ shift }, { status: 201 });
  } catch (err) {
    console.error('POST /api/hr/shifts error:', err);
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

