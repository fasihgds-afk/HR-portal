// models/PaidLeave.js
import mongoose from 'mongoose';

const PaidLeaveSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    // Leave allocations (default: 12 casual + 12 annual = 24 total)
    casualLeavesAllocated: {
      type: Number,
      default: 12,
      min: 0,
    },
    annualLeavesAllocated: {
      type: Number,
      default: 12,
      min: 0,
    },
    // Leave usage (only whole numbers, full days only)
    casualLeavesTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
    annualLeavesTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups by empCode and year
PaidLeaveSchema.index({ empCode: 1, year: 1 }, { unique: true });

// Virtual for total allocated leaves
PaidLeaveSchema.virtual('totalLeavesAllocated').get(function () {
  return (this.casualLeavesAllocated || 0) + (this.annualLeavesAllocated || 0);
});

// Virtual for total taken leaves
PaidLeaveSchema.virtual('totalLeavesTaken').get(function () {
  return (this.casualLeavesTaken || 0) + (this.annualLeavesTaken || 0);
});

// Virtual for remaining leaves
PaidLeaveSchema.virtual('totalLeavesRemaining').get(function () {
  return this.totalLeavesAllocated - this.totalLeavesTaken;
});

// Virtual for casual leaves remaining
PaidLeaveSchema.virtual('casualLeavesRemaining').get(function () {
  return (this.casualLeavesAllocated || 0) - (this.casualLeavesTaken || 0);
});

// Virtual for annual leaves remaining
PaidLeaveSchema.virtual('annualLeavesRemaining').get(function () {
  return (this.annualLeavesAllocated || 0) - (this.annualLeavesTaken || 0);
});

// Ensure virtuals are included in JSON
PaidLeaveSchema.set('toJSON', { virtuals: true });
PaidLeaveSchema.set('toObject', { virtuals: true });

// Static method to get or create paid leave record for an employee in a year
// Optional session for use inside MongoDB transactions
PaidLeaveSchema.statics.getOrCreate = async function (empCode, year, session = null) {
  const opts = session ? { session } : {};
  let paidLeave = await this.findOne({ empCode, year }, null, opts);

  if (!paidLeave) {
    paidLeave = await this.create([{
      empCode,
      year,
      casualLeavesAllocated: 12,
      annualLeavesAllocated: 12,
      casualLeavesTaken: 0,
      annualLeavesTaken: 0,
    }], opts);
    paidLeave = paidLeave[0];
  }

  return paidLeave;
};

const PaidLeave = mongoose.models.PaidLeave || mongoose.model('PaidLeave', PaidLeaveSchema);

export default PaidLeave;
