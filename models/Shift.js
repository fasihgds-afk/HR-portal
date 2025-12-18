// models/Shift.js
import mongoose from 'mongoose';

const ShiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    startTime: {
      type: String,
      required: true,
      // Format: "HH:mm" (24-hour format, e.g., "09:00", "12:00", "18:00")
    },
    endTime: {
      type: String,
      required: true,
      // Format: "HH:mm" (24-hour format, e.g., "18:00", "21:00", "03:00")
    },
    crossesMidnight: {
      type: Boolean,
      default: false,
      // true if shift end time is next day (e.g., 18:00-03:00)
    },
    gracePeriod: {
      type: Number,
      default: 15,
      // Grace period in minutes (default 15 minutes)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index for quick lookups
ShiftSchema.index({ code: 1 });
ShiftSchema.index({ isActive: 1 });

export default mongoose.models.Shift ||
  mongoose.model('Shift', ShiftSchema);
