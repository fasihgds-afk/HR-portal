// app/api/monitor/live/route.js
// Admin endpoint: returns live status of all enrolled (non-revoked) devices.
// DerivedState: OFFLINE if lastSeenAt > 180s ago, else lastState (ACTIVE/IDLE).

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Device from '@/models/Device';

const OFFLINE_THRESHOLD_SEC = 180; // 3 minutes

export async function GET() {
  try {
    await connectDB();

    const devices = await Device.find({ isRevoked: false })
      .select('empCode deviceName lastSeenAt lastState os agentVersion')
      .sort({ lastSeenAt: -1 })
      .lean();

    const now = Date.now();

    const result = devices.map((d) => {
      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const secsSinceLastSeen = (now - lastSeenMs) / 1000;

      let derivedState;
      if (!d.lastSeenAt || secsSinceLastSeen > OFFLINE_THRESHOLD_SEC) {
        derivedState = 'OFFLINE';
      } else {
        derivedState = d.lastState || 'IDLE';
      }

      return {
        empCode: d.empCode,
        deviceName: d.deviceName,
        os: d.os,
        agentVersion: d.agentVersion,
        lastSeenAt: d.lastSeenAt,
        lastSeenAgo: Math.round(secsSinceLastSeen) + 's',
        derivedState,
      };
    });

    return NextResponse.json({
      count: result.length,
      offlineThresholdSec: OFFLINE_THRESHOLD_SEC,
      devices: result,
    });
  } catch (err) {
    console.error('Live monitor error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
