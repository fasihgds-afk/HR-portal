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
      default: 20,
      // Grace period in minutes (default 20 minutes)
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
// Note: 'code' already has an index from 'unique: true', so we don't need to define it again
ShiftSchema.index({ isActive: 1 });

export default mongoose.models.Shift ||
  mongoose.model('Shift', ShiftSchema);
