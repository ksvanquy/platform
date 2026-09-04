import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/**
 * Băm mật khẩu bằng scrypt chuẩn native Node.js (RFC 7914).
 * Định dạng lưu trữ: `scrypt$<salt_hex>$<hash_hex>`
 */
export function hashPassword(password: string, salt?: string): string {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, generatedSalt, SCRYPT_KEYLEN);
  return `scrypt$${generatedSalt}$${derivedKey.toString('hex')}`;
}

/**
 * Kiểm tra mật khẩu khớp với chuỗi băm.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedKey = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(expectedKey, 'hex'));
  }

  // Legacy fallback if any
  const legacyHash = crypto.createHash('sha256').update(`quiz_salt_${password}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacyHash, 'utf8'), Buffer.from(storedHash, 'utf8'));
}
