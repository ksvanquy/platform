import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/infrastructure/crypto/password.js';

describe('Password Hashing & Verification (Unified scrypt RFC 7914)', () => {
  it('should hash password using scrypt with random salt and 64-byte key', () => {
    const password = 'mySuperSecurePassword2026!';
    const hash = hashPassword(password);

    expect(hash.startsWith('scrypt$')).toBe(true);
    const parts = hash.split('$');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toHaveLength(32); // 16 bytes salt = 32 hex chars
    expect(parts[2]).toHaveLength(128); // 64 bytes key = 128 hex chars
  });

  it('should produce different hashes for the same password due to random salting', () => {
    const password = 'identicalPassword';
    const hash1 = hashPassword(password);
    const hash2 = hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(verifyPassword(password, hash1)).toBe(true);
    expect(verifyPassword(password, hash2)).toBe(true);
  });

  it('should successfully verify correct password using scrypt', () => {
    const password = 'studentPassword123';
    const hash = hashPassword(password);

    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('should strictly REJECT legacy SHA-256 with quiz_salt_ format', () => {
    const password = 'legacyPassword';
    // Mô phỏng hash cũ bằng SHA-256 + quiz_salt_
    const legacySha256Hash = crypto.createHash('sha256').update(`quiz_salt_${password}`).digest('hex');

    // Phải bị từ chối ngay lập tức do hệ thống đã thống nhất chỉ dùng scrypt
    expect(verifyPassword(password, legacySha256Hash)).toBe(false);
  });

  it('should return false for malformed, truncated, or non-scrypt hashes safely', () => {
    const password = 'anyPassword';

    expect(verifyPassword(password, '')).toBe(false);
    expect(verifyPassword(password, 'invalid_hash')).toBe(false);
    expect(verifyPassword(password, 'scrypt$short')).toBe(false);
    expect(verifyPassword(password, 'scrypt$saltOnly$')).toBe(false);
    expect(verifyPassword(password, 'scrypt$salt$shortKey')).toBe(false);
    expect(verifyPassword(password, null as unknown as string)).toBe(false);
  });
});
