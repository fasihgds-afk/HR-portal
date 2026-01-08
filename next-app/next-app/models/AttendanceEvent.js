// next-app/models/AttendanceEvent.js
import mongoose from 'mongoose';

const AttendanceEventSchema = new mongoose.Schema(
  {
    deviceIp: String,
    eventTime: Date,
    empCode: String, // employeeNoString from device
    cardNo: String,
    doorNo: Number,
    serialNo: Number,
    verifyMode: String,
    attendanceStatus: String,
    major: Number,
    minor: Number,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

// ✅ PERFORMANCE: Indexes for common query patterns
// Composite index for range queries with empCode and minor filter
AttendanceEventSchema.index({ eventTime: 1, minor: 1, empCode: 1 });

// Index for single employee queries (empCode + eventTime range)
AttendanceEventSchema.index({ empCode: 1, eventTime: 1 });

// Index for eventTime range queries (for daily attendance)
AttendanceEventSchema.index({ eventTime: 1, minor: 1 });

export default mongoose.models.AttendanceEvent ||
  mongoose.model('AttendanceEvent', AttendanceEventSchema);
