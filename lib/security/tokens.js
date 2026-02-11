// lib/security/tokens.js
import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token (hex string).
 * @param {number} bytes - Number of random bytes (default 48 → 96 hex chars)
 * @returns {string} Hex-encoded token
 */
export function generateToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token with SHA-256.
 * Only the hash is stored in the database — never the raw token.
 * @param {string} token - Raw token string
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a raw token against a stored hash using constant-time comparison.
 * Prevents timing attacks.
 * @param {string} token - Raw token to verify
 * @param {string} storedHash - Stored SHA-256 hex hash
 * @returns {boolean} true if token matches
 */
export function verifyToken(token, storedHash) {
  const candidateHash = hashToken(token);
  // Both are hex strings of equal length (64 chars for SHA-256)
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
