// models/BreakLog.js
// Stores idle/break events reported by the desktop agent.
//
// HYBRID FLOW:
//   1. Form appears  → record created with reason="Pending", endedAt=null
//   2. Form submitted → reason updated to actual category + text
//   3. Employee works → endedAt set, durationMin calculated
//
// Each record = one idle period from form appearance to work resumption.

import mongoose from 'mongoose';

const BreakLogSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
    },
    department: {
      type: String,
    },
    date: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    shift: {
      type: String,
    },
    reason: {
      type: String,
      required: true,
      // "Pending" initially, then: Official, Personal Break, Namaz, Others
    },
    customReason: {
      type: String,
      default: 'Pending', // Updated when employee submits the form
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date, // null = still on break
      default: null,
    },
    durationMin: {
      type: Number, // auto-calculated when break ends
      default: 0,
    },
    deviceId: {
      type: String,
    },
  },
  { timestamps: true }
);

// Indexes for common queries
BreakLogSchema.index({ date: 1, empCode: 1 }, { background: true });
BreakLogSchema.index({ empCode: 1, date: -1 }, { background: true });
BreakLogSchema.index({ date: 1, department: 1 }, { background: true });
// Find open breaks (endedAt is null)
BreakLogSchema.index({ empCode: 1, endedAt: 1 }, { background: true });

export default mongoose.models.BreakLog ||
  mongoose.model('BreakLog', BreakLogSchema);
