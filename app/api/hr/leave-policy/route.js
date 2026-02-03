// app/api/hr/leave-policy/route.js
// Get and update leave policy (leaves per quarter, carry-forward) – configurable from HR frontend
import { connectDB } from '../../../../lib/db';
import LeavePolicy from '../../../../models/LeavePolicy';
import { getLeavePolicy } from '../../../../lib/leave/getLeavePolicy';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_POLICY = { leavesPerQuarter: 6, allowCarryForward: false, carryForwardMax: 0 };

// GET /api/hr/leave-policy – Return current policy
export async function GET() {
  try {
    const policy = await getLeavePolicy();
    return successResponse({ policy }, 'Leave policy retrieved', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err);
  }
}

// PUT /api/hr/leave-policy – Update policy (leavesPerQuarter, allowCarryForward, carryForwardMax)
export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const leavesPerQuarter = body.leavesPerQuarter != null
      ? parseInt(String(body.leavesPerQuarter), 10)
      : undefined;
    const allowCarryForward = body.allowCarryForward === true || body.allowCarryForward === 'true';
    const carryForwardMax = body.carryForwardMax != null
      ? Math.max(0, Math.min(10, parseInt(String(body.carryForwardMax), 10) || 0))
      : undefined;

    if (leavesPerQuarter != null && (leavesPerQuarter < 1 || leavesPerQuarter > 31)) {
      throw new ValidationError('leavesPerQuarter must be between 1 and 31');
    }

    const update = {};
    if (leavesPerQuarter != null) update.leavesPerQuarter = leavesPerQuarter;
    update.allowCarryForward = allowCarryForward;
    if (carryForwardMax != null) update.carryForwardMax = carryForwardMax;

    const doc = await LeavePolicy.findOneAndUpdate(
      { configId: 'default' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    )
      .lean()
      .maxTimeMS(2000);

    const policy = {
      leavesPerQuarter: doc.leavesPerQuarter ?? DEFAULT_POLICY.leavesPerQuarter,
      allowCarryForward: doc.allowCarryForward ?? DEFAULT_POLICY.allowCarryForward,
      carryForwardMax: doc.carryForwardMax ?? DEFAULT_POLICY.carryForwardMax,
    };

    return successResponse({ policy }, 'Leave policy updated', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
