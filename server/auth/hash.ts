// Hashing and random tokens, in one place so the browser-only demo can swap in its own version.
import crypto from 'node:crypto';

// Low scrypt cost keeps seeding and tests fast; fine for synthetic demo credentials.
const SCRYPT = { N: 1024, r: 8, p: 1 };

export const randomHex = (bytes: number) => crypto.randomBytes(bytes).toString('hex');
export const randomToken = () => crypto.randomBytes(24).toString('base64url');
export const deriveKey = (secret: string, salt: string) => crypto.scryptSync(secret, salt, 32, SCRYPT).toString('hex');
export const sha256Hex = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
