import crypto from 'node:crypto';
import type { Principal } from '@platform/contracts';
import { defaultJwksClient, JwksClient } from './jwks-client.js';

export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface JwtPayload {
  sub?: string;
  id?: string;
  userId?: string;
  email?: string;
  roles?: readonly string[] | string[];
  permissions?: readonly string[] | string[];
  isActive?: boolean;
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface VerifyJwtOptions {
  secret?: string;
  publicKey?: string;
  jwksClient?: JwksClient;
  clockToleranceSec?: number;
  requireActive?: boolean;
}

export function base64UrlDecode(str: string): string {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) {
    normalized += '=';
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function decodeJwtUnverified<T = JwtPayload>(token: string): { header: JwtHeader; payload: T } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(base64UrlDecode(parts[0])) as JwtHeader;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as T;
    return { header, payload };
  } catch {
    return null;
  }
}

export async function verifyJwtTokenAsync(
  token: string,
  options: VerifyJwtOptions = {}
): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as JwtHeader;
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    if (header.alg === 'RS256') {
      let pubKey = options.publicKey;
      if (!pubKey) {
        const client = options.jwksClient || defaultJwksClient;
        const fetchedKey = await client.getPublicKey(header.kid);
        if (fetchedKey) {
          pubKey = fetchedKey;
        }
      }

      if (!pubKey) {
        // Fallback to process.env.JWT_PUBLIC_KEY
        if (process.env.JWT_PUBLIC_KEY?.includes('BEGIN')) {
          pubKey = process.env.JWT_PUBLIC_KEY;
        }
      }

      if (!pubKey) {
        return null;
      }

      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      const isValid = verify.verify(pubKey, signature, 'base64url');
      if (!isValid) return null;
    } else if (header.alg === 'HS256') {
      const secret = options.secret || process.env.JWT_SECRET || 'dev-quiz-platform-secret-key-32-chars-min';
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToVerify)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      if (signature.length !== expectedSignature.length) {
        return null;
      }

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }
    } else {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    const tolerance = options.clockToleranceSec ?? 5;

    if (payload.exp && payload.exp + tolerance < now) {
      return null; // Expired
    }

    if (payload.nbf && payload.nbf - tolerance > now) {
      return null; // Not active yet
    }

    if (options.requireActive !== false && payload.isActive === false) {
      return null; // Deactivated account
    }

    return payload;
  } catch {
    return null;
  }
}

export function verifyJwtTokenSync(
  token: string,
  options: VerifyJwtOptions = {}
): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as JwtHeader;
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    if (header.alg === 'RS256') {
      let pubKey = options.publicKey || process.env.JWT_PUBLIC_KEY;
      if (!pubKey) {
        const cached = (options.jwksClient || defaultJwksClient).getCachedKey(header.kid);
        if (cached) pubKey = cached;
      }

      if (!pubKey) return null;

      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      const isValid = verify.verify(pubKey, signature, 'base64url');
      if (!isValid) return null;
    } else if (header.alg === 'HS256') {
      const secret = options.secret || process.env.JWT_SECRET || 'dev-quiz-platform-secret-key-32-chars-min';
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToVerify)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      if (signature.length !== expectedSignature.length) return null;
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
    } else {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    const tolerance = options.clockToleranceSec ?? 5;

    if (payload.exp && payload.exp + tolerance < now) return null;
    if (payload.nbf && payload.nbf - tolerance > now) return null;
    if (options.requireActive !== false && payload.isActive === false) return null;

    return payload;
  } catch {
    return null;
  }
}

export function mapJwtPayloadToPrincipal(payload: JwtPayload): Principal {
  const id = payload.id || payload.userId || payload.sub || '';
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];

  return {
    id,
    roles,
    permissions,
    metadata: {
      email: payload.email,
      isActive: payload.isActive ?? true,
      jti: payload.jti,
    },
  };
}
