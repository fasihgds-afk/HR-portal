import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    name: String,
    email: String,
    monthlySalary: Number,

    // NEW: alternate Saturday grouping
    // A → off on 1st, 3rd Saturday
    // B → off on 2nd, 4th Saturday
    saturdayGroup: {
      type: String,
      enum: ['A', 'B'],
      default: 'A',
    },

    // Legacy shift field (kept for backward compatibility)
    shift: {
      type: String,
      enum: ['D1', 'D2', 'S1', 'S2', 'D3'],
      default: 'D1',
    },
    // New: Reference to Shift model (for dynamic shifts)
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
    },

    department: String,
    designation: String,

    phoneNumber: String,
    cnic: String,

    profileImageBase64: String,
    profileImageUrl: String,
  },
  { timestamps: true }
);

// 🔁 Optional: only if you want faster department+shift group reports
EmployeeSchema.index({ department: 1, shift: 1 });

export default mongoose.models.Employee ||
  mongoose.model('Employee', EmployeeSchema);
