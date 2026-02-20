// app/api/agent/shift-info/route.js
// Returns the employee's current shift window so the desktop agent
// knows when to start/stop monitoring.

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Device from '@/models/Device';
import Employee from '@/models/Employee';
import Shift from '@/models/Shift';
import { verifyToken } from '@/lib/security/tokens';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empCode = searchParams.get('empCode');
    const deviceId = searchParams.get('deviceId');
    const deviceToken = searchParams.get('deviceToken');

    if (!empCode || !deviceId || !deviceToken) {
      return NextResponse.json(
        { error: 'empCode, deviceId, and deviceToken are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const device = await Device.findOne({
      deviceId,
      empCode: empCode.trim(),
      isRevoked: false,
    });

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found or revoked' },
        { status: 401 }
      );
    }

    if (!verifyToken(deviceToken, device.deviceTokenHash)) {
      return NextResponse.json(
        { error: 'Invalid device token' },
        { status: 401 }
      );
    }

    const emp = await Employee.findOne({ empCode: empCode.trim() })
      .select('shift shiftId')
      .lean();

    if (!emp) {
      return NextResponse.json(
        { error: `Employee not found: ${empCode}` },
        { status: 404 }
      );
    }

    let shift = null;
    if (emp.shiftId) {
      shift = await Shift.findById(emp.shiftId).lean();
    }
    if (!shift && emp.shift) {
      shift = await Shift.findOne({ code: emp.shift.toUpperCase().trim() }).lean();
    }

    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'No shift configured for this employee' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      shiftStart: shift.startTime,
      shiftEnd: shift.endTime,
      gracePeriod: shift.gracePeriod ?? 20,
      crossesMidnight: shift.crossesMidnight || false,
      shiftCode: shift.code,
    });
  } catch (err) {
    console.error('Shift-info error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
