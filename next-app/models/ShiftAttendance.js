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

    late: { type: Boolean, default: false },
    earlyLeave: { type: Boolean, default: false },

    excused: { type: Boolean, default: false },

    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// ✅ ADD THESE INDEXES
// For finding all records of a date quickly (cached path)
ShiftAttendanceSchema.index({ date: 1 });

// For upserting by (date + empCode + shift) in bulkWrite
ShiftAttendanceSchema.index({ date: 1, empCode: 1, shift: 1 });



export default mongoose.models.ShiftAttendance ||
  mongoose.model('ShiftAttendance', ShiftAttendanceSchema);
