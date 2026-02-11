// models/SuspiciousLog.js
import mongoose from 'mongoose';

const SuspiciousLogSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD (attendance date)
      required: true,
    },
    activityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // Which signals were suspicious (for HR audit)
    signals: {
      intervalScore: { type: Number },    // 0-25
      positionScore: { type: Number },    // 0-25
      mixScore: { type: Number },         // 0-25
      movementScore: { type: Number },    // 0-25
    },
    severity: {
      type: String,
      enum: ['WARNING', 'CRITICAL'],
      required: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    // Optional: HR can acknowledge / dismiss
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgedBy: {
      type: String,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Composite index for per-employee per-day queries
SuspiciousLogSchema.index({ empCode: 1, date: 1 }, { background: true });

// Index for admin views of recent suspicious activity
SuspiciousLogSchema.index({ detectedAt: -1 }, { background: true });

// Index for unacknowledged alerts
SuspiciousLogSchema.index({ acknowledged: 1, detectedAt: -1 }, { background: true });

export default mongoose.models.SuspiciousLog ||
  mongoose.model('SuspiciousLog', SuspiciousLogSchema);
