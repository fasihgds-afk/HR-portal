// models/LeavePolicy.js
// Single global leave policy (configurable from HR frontend)
import mongoose from 'mongoose';

const LeavePolicySchema = new mongoose.Schema(
  {
    configId: { type: String, required: true, unique: true, default: 'default' },
    leavesPerQuarter: { type: Number, required: true, default: 6, min: 1, max: 31 },
    allowCarryForward: { type: Boolean, default: false },
    carryForwardMax: { type: Number, default: 0, min: 0, max: 10 },
  },
  { timestamps: true }
);

const LeavePolicy = mongoose.models.LeavePolicy || mongoose.model('LeavePolicy', LeavePolicySchema);
export default LeavePolicy;
