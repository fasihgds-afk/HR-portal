// next-app/models/MonthlyAttendance.js
import mongoose from 'mongoose';

const MonthlyAttendanceSchema = new mongoose.Schema(
  {
    empCode: { type: String, index: true },
    name: String,
    department: String,
    designation: String,
    shift: String, // optional but handy

    month: { type: String, index: true }, // e.g. "2025-11"

    days: [
      {
        date: String,        // "2025-11-21"
        checkIn: Date,
        checkOut: Date,
        shift: String,       // D1/D2/S1/S2
        status: String,      // Present, Absent, Leave, Off, Unpaid Leave...
        reason: String,
        late: Boolean,
        earlyLeave: Boolean,
        excused: Boolean,
        salaryDeduct: Boolean, // if you ever want per-day deduction flag
      },
    ],

    totalLateCount: { type: Number, default: 0 },
    totalEarlyCount: { type: Number, default: 0 },
    totalSalaryDeductedDays: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Fast lookups by month + employee
MonthlyAttendanceSchema.index({ month: 1, empCode: 1 });

export default mongoose.models.MonthlyAttendance ||
  mongoose.model('MonthlyAttendance', MonthlyAttendanceSchema);
