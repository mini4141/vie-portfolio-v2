import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384, KEYLEN = 64;

/** Format: scrypt$<salt hex>$<hash hex>. Never store or log the plain password. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length, { N });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
