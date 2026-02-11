// models/Device.js
import mongoose from 'mongoose';

const DeviceSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
    },
    deviceTokenHash: {
      type: String,
      required: true,
    },
    deviceName: {
      type: String,
    },
    os: {
      type: String,
    },
    agentVersion: {
      type: String,
    },
    lastSeenAt: {
      type: Date,
      index: true,
    },
    lastState: {
      type: String,
      enum: ['ACTIVE', 'IDLE', 'SUSPICIOUS'],
      default: 'IDLE',
    },
    lastActivityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    suspiciousCount: {
      type: Number,
      default: 0,
    },
    flagged: {
      type: Boolean,
      default: false,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for empCode + deviceId lookups
DeviceSchema.index({ empCode: 1, deviceId: 1 }, { background: true });

// Index for admin monitor queries (non-revoked devices sorted by lastSeenAt)
DeviceSchema.index({ isRevoked: 1, lastSeenAt: -1 }, { background: true });

export default mongoose.models.Device ||
  mongoose.model('Device', DeviceSchema);
