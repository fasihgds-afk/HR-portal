// app/api/hr/shifts/migrate/route.js
// Migration script to create default shifts from hardcoded values
import { connectDB } from '../../../../../lib/db';
import Shift from '../../../../../models/Shift';
import { invalidateShiftsCache } from '../../../../../lib/cache/shiftCache';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    await connectDB();

    const defaultShifts = [
      {
        name: 'Day Shift 1',
        code: 'D1',
        startTime: '09:00',
        endTime: '18:00',
        crossesMidnight: false,
        gracePeriod: 15,
        description: 'Day Shift 1 (09:00-18:00)',
        isActive: true,
      },
      {
        name: 'Day Shift 2',
        code: 'D2',
        startTime: '15:00',
        endTime: '24:00',
        crossesMidnight: false,
        gracePeriod: 15,
        description: 'Day Shift 2 (15:00-24:00)',
        isActive: true,
      },
      {
        name: 'Day Shift 3',
        code: 'D3',
        startTime: '12:00',
        endTime: '21:00',
        crossesMidnight: false,
        gracePeriod: 15,
        description: 'Day Shift 3 (12:00-21:00)',
        isActive: true,
      },
      {
        name: 'Night Shift 1',
        code: 'S1',
        startTime: '18:00',
        endTime: '03:00',
        crossesMidnight: true,
        gracePeriod: 15,
        description: 'Night Shift 1 (18:00-03:00 next day)',
        isActive: true,
      },
      {
        name: 'Night Shift 2',
        code: 'S2',
        startTime: '21:00',
        endTime: '06:00',
        crossesMidnight: true,
        gracePeriod: 15,
        description: 'Night Shift 2 (21:00-06:00 next day, Saturday: 18:00-03:00)',
        isActive: true,
      },
    ];

    const results = [];
    for (const shiftData of defaultShifts) {
      try {
        // Check if shift already exists
        const existing = await Shift.findOne({ code: shiftData.code });
        if (existing) {
          // Update existing shift to ensure isActive is true
          existing.isActive = true;
          await existing.save();
          results.push({ code: shiftData.code, status: 'updated', shift: existing });
        } else {
          const shift = await Shift.create(shiftData);
          results.push({ code: shiftData.code, status: 'created', shift });
        }
      } catch (err) {
        results.push({ code: shiftData.code, status: 'error', error: err.message });
      }
    }

    // CRITICAL: Invalidate cache after migration (creates/updates shifts)
    invalidateShiftsCache();

    return successResponse(
      { results },
      'Migration completed',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

