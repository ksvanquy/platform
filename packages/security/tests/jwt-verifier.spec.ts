import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyJwtTokenSync,
  verifyJwtTokenAsync,
  mapJwtPayloadToPrincipal,
  decodeJwtUnverified,
} from '../src/token/jwt-verifier.js';
import { JwksClient } from '../src/token/jwks-client.js';

describe('@platform/security - Token Verifier & JWKS Client', () => {
  // Generate a test RSA key pair for unit testing
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const hmacSecret = 'test-secret-key-32-chars-minimum-length!';

  function createHs256Token(payload: Record<string, unknown>, secret = hmacSecret): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encHeader}.${encPayload}`)
      .digest('base64url');
    return `${encHeader}.${encPayload}.${signature}`;
  }

  function createRs256Token(payload: Record<string, unknown>, privKey = privateKey, kid = 'key_1'): string {
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${encHeader}.${encPayload}`);
    const signature = sign.sign(privKey, 'base64url');
    return `${encHeader}.${encPayload}.${signature}`;
  }

  it('should verify a valid HS256 token synchronously', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createHs256Token({
      sub: 'usr_student_01',
      roles: ['STUDENT'],
      permissions: ['quiz:read'],
      exp: now + 3600,
    });

    const payload = verifyJwtTokenSync(token, { secret: hmacSecret });
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('usr_student_01');

    const principal = mapJwtPayloadToPrincipal(payload!);
    expect(principal.id).toBe('usr_student_01');
    expect(principal.roles).toContain('STUDENT');
  });

  it('should verify a valid RS256 token using public key', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createRs256Token({
      userId: 'usr_instructor_01',
      roles: ['INSTRUCTOR'],
      permissions: ['quiz:write'],
      exp: now + 3600,
    });

    const payload = verifyJwtTokenSync(token, { publicKey });
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('usr_instructor_01');
  });

  it('should reject an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = createHs256Token({
      sub: 'usr_student_01',
      exp: now - 3600, // Expired 1 hour ago
    });

    const payload = verifyJwtTokenSync(expiredToken, { secret: hmacSecret, clockToleranceSec: 0 });
    expect(payload).toBeNull();
  });

  it('should reject a tampered token signature', () => {
    const token = createHs256Token({ sub: 'usr_student_01' });
    const tampered = token.slice(0, -5) + 'abcde';
    const payload = verifyJwtTokenSync(tampered, { secret: hmacSecret });
    expect(payload).toBeNull();
  });

  it('should reject a deactivated account (isActive = false)', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createHs256Token({
      sub: 'usr_locked_01',
      isActive: false,
      exp: now + 3600,
    });

    const payload = verifyJwtTokenSync(token, { secret: hmacSecret, requireActive: true });
    expect(payload).toBeNull();
  });

  it('should verify RS256 token via cached JwksClient', async () => {
    const jwks = new JwksClient();
    jwks.setCachedKey('key_1', publicKey);

    const now = Math.floor(Date.now() / 1000);
    const token = createRs256Token(
      { sub: 'usr_admin_01', roles: ['ADMIN'], exp: now + 3600 },
      privateKey,
      'key_1'
    );

    const payload = await verifyJwtTokenAsync(token, { jwksClient: jwks });
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('usr_admin_01');
  });

  it('should decode unverified token header and payload correctly', () => {
    const token = createHs256Token({ customField: 'testValue' });
    const decoded = decodeJwtUnverified<{ customField: string }>(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload.customField).toBe('testValue');
  });
});
