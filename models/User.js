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
      enum: ['HR', 'EMPLOYEE'],
      required: true,
    },
    // (optional but very useful)
    employeeEmpCode: {
      type: String, // same code as in Employee.empCode
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.User ||
  mongoose.model('User', UserSchema);
