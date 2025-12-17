const mongoose = require('mongoose');

const attendanceEventSchema = new mongoose.Schema(
  {
    deviceIp: String,
    eventTime: { type: Date, index: true },
    empCode: { type: String, index: true }, // employeeNoString from device
    cardNo: String,
    doorNo: Number,
    serialNo: Number,
    verifyMode: String,       // currentVerifyMode
    attendanceStatus: String, // if device sends this
    major: Number,
    minor: Number,
    raw: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

// avoid duplicate events from device
attendanceEventSchema.index(
  { deviceIp: 1, eventTime: 1, serialNo: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('AttendanceEvent', attendanceEventSchema);
