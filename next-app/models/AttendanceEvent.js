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

// ✅ ADD THIS (for fast range + empCode queries)
AttendanceEventSchema.index({ eventTime: 1, minor: 1, empCode: 1 });

export default mongoose.models.AttendanceEvent ||
  mongoose.model('AttendanceEvent', AttendanceEventSchema);
