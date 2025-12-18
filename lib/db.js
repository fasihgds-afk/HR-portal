// next-app/lib/db.js
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGO_URI in .env.local');
}

// Debug: see which host we're trying to hit (only log once per server start)
if (!global.mongoLogged) {
  console.log(
    'Mongo connecting to:',
    MONGODB_URI.split('@')[1]?.split('/')[0] || '(no host part)'
  );
  global.mongoLogged = true;
}

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
