import * as bcrypt from 'bcrypt';

/**
 * Password hashing helpers, centralized so the seed script, UsersService, and
 * AuthService all use the same algorithm and cost factor.
 */

// Reason: 12 rounds balances brute-force resistance against login latency.
const SALT_ROUNDS = 12;

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Constant-time compare of a plaintext password against a stored hash. */
export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
