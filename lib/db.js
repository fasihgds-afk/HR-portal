// next-app/lib/db.js
import mongoose from 'mongoose';

// Note: delay reading MONGO_URI until connectDB is called so builds or
// serverless prerendering that import this module without a runtime
// env don't fail at import time.

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGO_URI;
  if (!MONGODB_URI) {
    throw new Error('Please define MONGO_URI in .env.local');
  }

  // OPTIMIZATION: Fast connection check - use cached connection if ready
  // This avoids the slower mongoose.connection.readyState check on every call
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  
  // Connection is dead or doesn't exist, reset cache
  if (cached.conn && mongoose.connection.readyState !== 1) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      retryWrites: true,
      retryReads: true,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongoose) => {
        // Connection event handlers for better error handling
        mongoose.connection.on('error', (err) => {
          console.error('MongoDB connection error:', err);
          cached.conn = null;
          cached.promise = null;
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('MongoDB disconnected. Reconnecting...');
          cached.conn = null;
          cached.promise = null;
        });

        mongoose.connection.on('reconnected', () => {
          // MongoDB reconnected
        });

        // Debug: see which host we're trying to hit (only log once per server start)
        if (!global.mongoLogged) {
          // MongoDB connected
          global.mongoLogged = true;
          
          // Ensure indexes are created on first connection (after connection is ready)
          if (!global.indexesEnsured) {
            global.indexesEnsured = true;
            // Wait a bit to ensure connection is fully ready, then create indexes
            setTimeout(() => {
              import('./db/ensureIndexes.js').then(({ ensureAllIndexes }) => {
                ensureAllIndexes().catch(err => {
                  console.warn('Index creation warning:', err.message);
                });
              });
            }, 1000); // Wait 1 second for connection to be fully ready
          }
        }

        return mongoose;
      })
      .catch((err) => {
        console.error('MongoDB connection failed:', err);
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}
