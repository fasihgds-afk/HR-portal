// models/LeaveRecord.js
import mongoose from 'mongoose';

const LeaveRecordSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    leaveType: {
      type: String,
      enum: ['casual', 'annual', 'paid'], // 'paid' = quarter-based (6 per quarter)
      required: true,
    },
    reason: {
      type: String,
      default: '',
    },
    markedBy: {
      type: String, // HR user who marked the leave
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index for fast lookups by empCode and date
LeaveRecordSchema.index({ empCode: 1, date: 1 }, { unique: true });

// Index for date range queries (year-based reports)
LeaveRecordSchema.index({ date: 1 });

const LeaveRecord = mongoose.models.LeaveRecord || mongoose.model('LeaveRecord', LeaveRecordSchema);

export default LeaveRecord;
