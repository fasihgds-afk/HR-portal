// models/ShiftAttendance.js
import mongoose from 'mongoose';

const ShiftAttendanceSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    empCode: { type: String, required: true },

    employeeName: { type: String },
    department: { type: String },
    designation: { type: String },

    shift: { type: String }, // D1, D2, D3, S1, S2

    checkIn: { type: Date },
    checkOut: { type: Date },
    totalPunches: { type: Number, default: 0 },

    attendanceStatus: { type: String }, // Present / Absent / Leave / etc.
    reason: { type: String },

    // Paid leave type (null if not on paid leave; 'paid' = quarter-based, 'casual'/'annual' = legacy)
    leaveType: {
      type: String,
      default: null,
    },

    late: { type: Boolean, default: false },
    earlyLeave: { type: Boolean, default: false },

    excused: { type: Boolean, default: false }, // Legacy: kept for backward compatibility
    lateExcused: { type: Boolean, default: false }, // Separate excused for late
    earlyExcused: { type: Boolean, default: false }, // Separate excused for early

    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// ✅ PERFORMANCE: Indexes for common query patterns
// For finding all records of a date quickly
ShiftAttendanceSchema.index({ date: 1 });

// For upserting by (date + empCode + shift) in bulkWrite
ShiftAttendanceSchema.index({ date: 1, empCode: 1, shift: 1 }, { unique: false });

// For monthly attendance queries (date range + empCode)
ShiftAttendanceSchema.index({ date: 1, empCode: 1 });

// Index for empCode queries (for employee-specific lookups) - descending date for recent first
ShiftAttendanceSchema.index({ empCode: 1, date: -1 });

// Index for status filtering (common in reports)
ShiftAttendanceSchema.index({ date: 1, attendanceStatus: 1 });

// Index for late/early leave queries
ShiftAttendanceSchema.index({ date: 1, late: 1, earlyLeave: 1 });



export default mongoose.models.ShiftAttendance ||
  mongoose.model('ShiftAttendance', ShiftAttendanceSchema);
