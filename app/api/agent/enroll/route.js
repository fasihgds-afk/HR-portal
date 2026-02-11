// app/api/agent/enroll/route.js
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import Device from '@/models/Device';
import Employee from '@/models/Employee';
import { generateToken, hashToken } from '@/lib/security/tokens';

export async function POST(request) {
  try {
    const body = await request.json();
    const { empCode, deviceName, os, agentVersion } = body;

    // Validate required field
    if (!empCode || typeof empCode !== 'string') {
      return NextResponse.json(
        { error: 'empCode is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify employee exists
    const employee = await Employee.findOne({ empCode: empCode.trim() }).lean();
    if (!employee) {
      return NextResponse.json(
        { error: `Employee not found: ${empCode}` },
        { status: 404 }
      );
    }

    // Generate unique device ID and secure token
    const deviceId = crypto.randomUUID();
    const deviceToken = generateToken();
    const deviceTokenHash = hashToken(deviceToken);

    // Create device record (store ONLY the hash, never the raw token)
    await Device.create({
      empCode: empCode.trim(),
      deviceId,
      deviceTokenHash,
      deviceName: deviceName || 'Unknown',
      os: os || 'Unknown',
      agentVersion: agentVersion || '1.0.0',
      lastSeenAt: new Date(),
      lastState: 'IDLE',
    });

    // Return the raw token to the agent (one-time only — we don't store it)
    return NextResponse.json({
      success: true,
      deviceId,
      deviceToken, // Agent saves this locally; server only has the hash
      heartbeatIntervalSec: 180,
      message: `Device enrolled for ${employee.name || empCode}`,
    });
  } catch (err) {
    // Handle duplicate device (shouldn't happen with randomUUID, but safety net)
    if (err.code === 11000) {
      return NextResponse.json(
        { error: 'Device enrollment conflict. Please retry.' },
        { status: 409 }
      );
    }
    console.error('Enrollment error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
