// next-app/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['HR', 'EMPLOYEE', 'ADMIN'],
      required: true,
      index: true, // Index for role-based queries
    },
    // (optional but very useful)
    employeeEmpCode: {
      type: String, // same code as in Employee.empCode
      index: true,
    },
  },
  { timestamps: true }
);

// ✅ PERFORMANCE: Additional indexes for common query patterns
// Composite index for role + email lookups (common in auth)
UserSchema.index({ role: 1, email: 1 });

// Index for employee code lookups (for employee authentication)
UserSchema.index({ employeeEmpCode: 1, role: 1 });

export default mongoose.models.User ||
  mongoose.model('User', UserSchema);
