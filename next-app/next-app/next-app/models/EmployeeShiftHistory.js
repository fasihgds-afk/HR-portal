// models/EmployeeShiftHistory.js
import mongoose from 'mongoose';

const EmployeeShiftHistorySchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: true,
    },
    shiftCode: {
      type: String,
      required: true,
      // Store shift code for quick reference without join
    },
    effectiveDate: {
      type: String,
      required: true,
      // Format: "YYYY-MM-DD" - when this shift assignment becomes effective
    },
    endDate: {
      type: String,
      // Format: "YYYY-MM-DD" - when this shift assignment ends (null if current)
      // If null, this is the current/active shift
    },
    changedBy: {
      type: String,
      // User who made the change (optional)
    },
    reason: {
      type: String,
      // Reason for shift change (optional)
    },
  },
  { timestamps: true }
);

// Index for finding active shift for an employee on a specific date
EmployeeShiftHistorySchema.index({ empCode: 1, effectiveDate: 1 });
EmployeeShiftHistorySchema.index({ empCode: 1, effectiveDate: 1, endDate: 1 });

export default mongoose.models.EmployeeShiftHistory ||
  mongoose.model('EmployeeShiftHistory', EmployeeShiftHistorySchema);

