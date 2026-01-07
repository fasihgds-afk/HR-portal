// next-app/models/ViolationRules.js
import mongoose from 'mongoose';

const ViolationRulesSchema = new mongoose.Schema(
  {
    // Violation Deduction Configuration
    violationConfig: {
      freeViolations: {
        type: Number,
        default: 2,
        min: 0,
        comment: 'Number of free violations before deductions start (1st, 2nd violations are free)',
      },
      milestoneInterval: {
        type: Number,
        default: 3,
        min: 1,
        comment: 'Every Nth violation = full day deduction (3rd, 6th, 9th, 12th, ...)',
      },
      perMinuteRate: {
        type: Number,
        default: 0.007,
        min: 0,
        comment: 'Days per minute of violation (e.g., 0.007 = 0.007 days per minute)',
      },
      maxPerMinuteFine: {
        type: Number,
        default: 1.0,
        min: 0,
        comment: 'Maximum per-minute fine per violation (cap at 1 day)',
      },
    },

    // Absent/Missing Punch Deduction Configuration
    absentConfig: {
      bothMissingDays: {
        type: Number,
        default: 1.0,
        min: 0,
        comment: 'Both check-in and check-out missing = X days deduction',
      },
      partialPunchDays: {
        type: Number,
        default: 1.0,
        min: 0,
        comment: 'Only one punch missing = X days deduction',
      },
      leaveWithoutInformDays: {
        type: Number,
        default: 1.5,
        min: 0,
        comment: 'Leave Without Inform = X days deduction',
      },
    },

    // Leave Deduction Configuration
    leaveConfig: {
      unpaidLeaveDays: {
        type: Number,
        default: 1.0,
        min: 0,
        comment: 'Unpaid Leave = X days deduction per occurrence',
      },
      sickLeaveDays: {
        type: Number,
        default: 1.0,
        min: 0,
        comment: 'Sick Leave = X days deduction per occurrence',
      },
      halfDayDays: {
        type: Number,
        default: 0.5,
        min: 0,
        comment: 'Half Day = X days deduction per occurrence',
      },
      paidLeaveDays: {
        type: Number,
        default: 0.0,
        min: 0,
        comment: 'Paid Leave = X days deduction (usually 0)',
      },
    },

    // Salary Calculation Configuration
    salaryConfig: {
      daysPerMonth: {
        type: Number,
        default: 30,
        min: 1,
        max: 31,
        comment: 'Days per month for salary calculation (can be 26, 30, 31)',
      },
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
      comment: 'Only one active rule set at a time',
    },
    description: {
      type: String,
      comment: 'Optional description of this rule set',
    },
    updatedBy: {
      type: String,
      comment: 'Email or ID of user who last updated these rules',
    },
  },
  { timestamps: true }
);

// Index for active rules
ViolationRulesSchema.index({ isActive: 1 });

// Ensure only one active rule set exists
ViolationRulesSchema.pre('save', async function (next) {
  if (this.isActive && this.isNew) {
    // Deactivate all other rules when creating a new active one
    await mongoose.model('ViolationRules').updateMany(
      { _id: { $ne: this._id } },
      { isActive: false }
    );
  }
  next();
});

export default mongoose.models.ViolationRules ||
  mongoose.model('ViolationRules', ViolationRulesSchema);

