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
 * Kiểm tra mật khẩu khớp với chuỗi băm scrypt (RFC 7914).
 * Thống nhất dùng duy nhất scrypt, loại bỏ hoàn toàn SHA-256 và quiz_salt_ legacy.
 * Áp dụng crypto.timingSafeEqual chống tấn công Timing Attack.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$')) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }

  const salt = parts[1];
  const expectedKeyHex = parts[2];

  if (!salt || !expectedKeyHex) {
    return false;
  }

  try {
    const expectedBuf = Buffer.from(expectedKeyHex, 'hex');
    // SCRYPT_KEYLEN = 64 bytes (128 hex chars). Nếu độ dài không đúng chuẩn scrypt, từ chối ngay.
    if (expectedBuf.length !== SCRYPT_KEYLEN) {
      return false;
    }

    const derivedKeyBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(derivedKeyBuf, expectedBuf);
  } catch {
    return false;
  }
}
