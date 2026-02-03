// models/PaidLeaveQuarter.js
// Quarter-based paid leave: 6 leaves per quarter, no carry-forward
import mongoose from 'mongoose';
import { LEAVES_PER_QUARTER } from '../lib/leave/quarterUtils';

const PaidLeaveQuarterSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    year: { type: Number, required: true, index: true },
    quarter: { type: Number, required: true, min: 1, max: 4, index: true },
    leavesAllocated: { type: Number, default: LEAVES_PER_QUARTER, min: 0 },
    leavesTaken: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

PaidLeaveQuarterSchema.index({ empCode: 1, year: 1, quarter: 1 }, { unique: true });

PaidLeaveQuarterSchema.virtual('leavesRemaining').get(function () {
  return Math.max(0, (this.leavesAllocated || 0) - (this.leavesTaken || 0));
});

PaidLeaveQuarterSchema.set('toJSON', { virtuals: true });
PaidLeaveQuarterSchema.set('toObject', { virtuals: true });

/**
 * @param {string} empCode
 * @param {number} year
 * @param {number} quarter
 * @param {number} [leavesPerQuarter] - Optional; from LeavePolicy. If omitted, uses LEAVES_PER_QUARTER.
 * @param {import('mongoose').ClientSession} [session] - Optional; for use inside a transaction.
 */
PaidLeaveQuarterSchema.statics.getOrCreate = async function (empCode, year, quarter, leavesPerQuarter, session) {
  const allocated = leavesPerQuarter != null ? leavesPerQuarter : LEAVES_PER_QUARTER;
  const query = this.findOne({ empCode, year, quarter });
  if (session) query.session(session);
  let doc = await query.exec();
  if (!doc) {
    const opts = session ? { session } : {};
    const created = await this.create(
      [{ empCode, year, quarter, leavesAllocated: allocated, leavesTaken: 0 }],
      opts
    );
    doc = Array.isArray(created) ? created[0] : created;
  }
  return doc;
};

const PaidLeaveQuarter = mongoose.models.PaidLeaveQuarter || mongoose.model('PaidLeaveQuarter', PaidLeaveQuarterSchema);
export default PaidLeaveQuarter;
