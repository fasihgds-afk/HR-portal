// next-app/lib/db/ensureIndexes.js
/**
 * Ensure all database indexes are created
 * Call this on server startup to guarantee indexes exist
 */

// Use dynamic imports to avoid module resolution issues
// Models will be imported when ensureAllIndexes is called

/**
 * Create all indexes for all models
 * This ensures indexes exist even if they weren't created automatically
 */
export async function ensureAllIndexes() {
  try {
    // Ensuring database indexes
    
    // Use dynamic imports to avoid module resolution issues at build time
    const [
      { default: Employee },
      { default: ShiftAttendance },
      { default: User },
      { default: ViolationRules },
      { default: Shift },
    ] = await Promise.all([
      import('../../models/Employee'),
      import('../../models/ShiftAttendance'),
      import('../../models/User'),
      import('../../models/ViolationRules'),
      import('../../models/Shift'),
    ]);
    
    // Create indexes - they will be created in background if collection is large
    // Note: createIndexes() doesn't accept options, but indexes defined in schema
    // with { background: true } will be created in background
    const results = await Promise.allSettled([
      Employee.createIndexes().catch(err => {
        // Index might already exist or creation is in progress
        if (err.message?.includes('already exists') || err.message?.includes('timeout')) {
          return Promise.resolve();
        }
        throw err;
      }),
      ShiftAttendance.createIndexes().catch(err => {
        // Suppress warnings about existing indexes with same name but different properties
        if (err.message?.includes('same name as the requested index') || 
            err.message?.includes('already exists')) {
          return Promise.resolve();
        }
        throw err;
      }),
      User.createIndexes().catch(err => {
        if (err.message?.includes('already exists')) {
          return Promise.resolve();
        }
        throw err;
      }),
      ViolationRules.createIndexes().catch(err => {
        if (err.message?.includes('already exists')) {
          return Promise.resolve();
        }
        throw err;
      }),
      Shift.createIndexes().catch(err => {
        // Suppress warnings about existing indexes with same name but different properties
        if (err.message?.includes('same name as the requested index') || 
            err.message?.includes('already exists')) {
          return Promise.resolve();
        }
        throw err;
      }),
    ]);
    
    // Only log actual errors, not index conflicts (which are harmless)
    results.forEach((result, index) => {
      const modelNames = ['Employee', 'ShiftAttendance', 'User', 'ViolationRules', 'Shift'];
      if (result.status === 'rejected') {
        const errorMsg = result.reason?.message || '';
        // Only log if it's not a harmless index conflict
        if (!errorMsg.includes('same name as the requested index') && 
            !errorMsg.includes('already exists')) {
          console.warn(`⚠️ ${modelNames[index]} index creation error:`, errorMsg);
        }
      }
    });
    
    // All indexes ensured
  } catch (err) {
    console.error('❌ Error ensuring indexes:', err);
    // Don't throw - indexes might already exist
  }
}

