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
    // Now accepts any shift code dynamically from Shift model
    shift: {
      type: String,
      // No enum restriction - accepts any shift code from Shift model
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
EmployeeSchema.index({ department: 1, shift: 1 }, { background: true });

// ✅ PERFORMANCE: Indexes for common query patterns
// Index for department filtering
EmployeeSchema.index({ department: 1 }, { background: true });

// Index for shift filtering
EmployeeSchema.index({ shift: 1 }, { background: true });

// Index for email (for email lookups and searches)
EmployeeSchema.index({ email: 1 }, { background: true });

// Index for shiftId reference (for populating shift data)
EmployeeSchema.index({ shiftId: 1 }, { background: true });

// Text index for search (name, email, empCode)
// This supports $text search queries (faster than regex)
// Note: Only one text index per collection, so we include all searchable fields
EmployeeSchema.index({ name: 'text', email: 'text', empCode: 'text' }, { background: true });

// Compound index for common filter combinations (department + shift queries)
EmployeeSchema.index({ department: 1, shift: 1, empCode: 1 }, { background: true });

// Compound index for shiftId + department (for shift-based filtering with department)
EmployeeSchema.index({ shiftId: 1, department: 1 }, { background: true });

// CRITICAL: Index for sorting by empCode (used in all list queries)
// This index is essential for fast pagination - MUST exist for performance
// empCode already has an index from unique: true, but we ensure it's optimized for sorting
// The existing empCode_1 index should work, but we make sure it's there

// Ensure indexes are created when model is initialized
const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);

// NOTE: Index creation is now handled by ensureAllIndexes() in lib/db/ensureIndexes.js
// which is called after mongoose.connect() in lib/db.js
// This prevents "Cannot call createIndex() before initial connection" errors
// Only create indexes here if connection is already established (for backward compatibility)
if (typeof window === 'undefined') {
  // Check if connection is ready before creating indexes
  // This prevents the error when bufferCommands = false
  const checkAndCreateIndexes = () => {
    if (mongoose.connection.readyState === 1) {
      // Connection is ready, safe to create indexes
      Employee.createIndexes().catch((err) => {
        // Ignore errors - indexes might already exist or will be created by ensureAllIndexes
        if (process.env.NODE_ENV === 'development') {
          console.warn('Employee index creation warning (may already exist):', err.message);
        }
      });
    } else {
      // Connection not ready yet, wait a bit and try again
      setTimeout(checkAndCreateIndexes, 100);
    }
  };
  
  // Only try to create indexes if we're in a server environment
  // The ensureAllIndexes() function will handle it properly after connection
  // This is just a fallback for backward compatibility
}

export default Employee;
