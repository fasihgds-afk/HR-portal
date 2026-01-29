import mongoose from 'mongoose';

/**
 * Department model – optional config for weekend/Saturday policy.
 * Used by monthly attendance to decide if a Saturday is off for employees in this department.
 *
 * saturdayPolicy:
 * - 'all_off'   → Every Saturday is off for this department.
 * - 'alternate' → Alternate Saturdays: use employee's saturdayGroup (A = 1st & 3rd Sat off, B = 2nd & 4th Sat off).
 *
 * If no Department record exists for a department name, policy defaults to 'alternate'.
 */
const DepartmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    saturdayPolicy: {
      type: String,
      enum: ['all_off', 'alternate'],
      default: 'alternate',
    },
  },
  { timestamps: true }
);

const Department = mongoose.models.Department || mongoose.model('Department', DepartmentSchema);

export default Department;
