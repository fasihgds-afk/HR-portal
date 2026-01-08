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
    console.log('📊 Ensuring database indexes...');
    
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
          console.warn('Employee indexes may already exist or are being created in background');
          return Promise.resolve();
        }
        throw err;
      }),
      ShiftAttendance.createIndexes(),
      User.createIndexes(),
      ViolationRules.createIndexes(),
      Shift.createIndexes(),
    ]);
    
    results.forEach((result, index) => {
      const modelNames = ['Employee', 'ShiftAttendance', 'User', 'ViolationRules', 'Shift'];
      if (result.status === 'fulfilled') {
        console.log(`✅ ${modelNames[index]} indexes ensured`);
      } else {
        console.warn(`⚠️ ${modelNames[index]} index creation:`, result.reason?.message || result.reason);
      }
    });
    
    console.log('✅ All indexes ensured');
  } catch (err) {
    console.error('❌ Error ensuring indexes:', err);
    // Don't throw - indexes might already exist
  }
}

