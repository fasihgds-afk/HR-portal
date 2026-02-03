// lib/leave/getLeavePolicy.js
// Returns current leave policy from DB (used by leave APIs)
import { connectDB } from '../db';
import LeavePolicy from '../../models/LeavePolicy';

const DEFAULT_POLICY = {
  leavesPerQuarter: 6,
  allowCarryForward: false,
  carryForwardMax: 0,
};

/**
 * Get current leave policy. Creates default document if none exists.
 * @returns {Promise<{ leavesPerQuarter: number, allowCarryForward: boolean, carryForwardMax: number }>}
 */
export async function getLeavePolicy() {
  await connectDB();
  let doc = await LeavePolicy.findOne({ configId: 'default' }).lean().maxTimeMS(2000);
  if (!doc) {
    doc = await LeavePolicy.create({
      configId: 'default',
      ...DEFAULT_POLICY,
    });
    doc = doc.toObject ? doc.toObject() : doc;
  }
  return {
    leavesPerQuarter: doc.leavesPerQuarter ?? DEFAULT_POLICY.leavesPerQuarter,
    allowCarryForward: doc.allowCarryForward ?? DEFAULT_POLICY.allowCarryForward,
    carryForwardMax: doc.carryForwardMax ?? DEFAULT_POLICY.carryForwardMax,
  };
}
