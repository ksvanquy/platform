import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePermissionsForRoles } from '../../domain/role/role.js';
import { ITokenStorage, TokenRecord } from '../../domain/token/token.storage.port.js';
import { createTokenStorage } from '../persistence/token-storage.factory.js';

export interface TokenPayload {
  sub: string;
  roles: readonly string[];
  permissions?: readonly string[];
  metadata?: Record<string, unknown>;
  email?: string;
  name?: string;
  isActive?: boolean;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
  tokenType: 'Bearer';
  familyId?: string;
}

export interface TokenServiceOptions {
  algorithm?: 'RS256' | 'HS256';
  secret?: string;
  privateKey?: string;
  publicKey?: string;
  issuer?: string;
  audience?: string;
  keyId?: string;
  rotatedKeys?: Array<{ keyId: string; publicKey: string }>;
  tokenStorage?: ITokenStorage;
}

// Singleton key pair caching for development/testing when env keys are not provided
let globalRsaKeyPair: { privateKey: string; publicKey: string } | null = null;

function getSharedKeyFilePath(): string {
  try {
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'package.json'))) {
        return path.join(dir, '.dev-keys.json');
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fallback
  }
  return path.resolve(process.cwd(), '.dev-keys.json');
}

export function getDefaultRsaKeyPair(): { privateKey: string; publicKey: string } {
  if (!globalRsaKeyPair) {
    const normalizePem = (key?: string) => {
      if (!key) return '';
      let normalized = key.trim();
      if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
        normalized = normalized.slice(1, -1);
      }
      return normalized.replace(/\\n/g, '\n');
    };

    const envPriv = normalizePem(process.env.JWT_PRIVATE_KEY);
    const envPub = normalizePem(process.env.JWT_PUBLIC_KEY);

    if (envPriv && envPub && envPriv.includes('BEGIN') && envPub.includes('BEGIN')) {
      try {
        crypto.createPrivateKey(envPriv);
        crypto.createPublicKey(envPub);
        globalRsaKeyPair = { privateKey: envPriv, publicKey: envPub };
      } catch {
        console.warn('⚠️ Invalid RSA keys provided in environment, falling back to secure auto-generated 2048-bit RSA key pair.');
      }
    }

    if (!globalRsaKeyPair) {
      const keyFilePath = getSharedKeyFilePath();
      if (fs.existsSync(keyFilePath)) {
        try {
          const content = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
          if (content.privateKey?.includes('BEGIN') && content.publicKey?.includes('BEGIN')) {
            crypto.createPrivateKey(content.privateKey);
            crypto.createPublicKey(content.publicKey);
            globalRsaKeyPair = { privateKey: content.privateKey, publicKey: content.publicKey };
          }
        } catch {
          // ignore error and generate fresh
        }
      }

      if (!globalRsaKeyPair) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        globalRsaKeyPair = { privateKey, publicKey };
        try {
          fs.writeFileSync(keyFilePath, JSON.stringify(globalRsaKeyPair, null, 2), 'utf8');
        } catch {
          // ignore if disk write fails
        }
      }
    }
  }
  return globalRsaKeyPair;
}

export class TokenService {
  private readonly algorithm: 'RS256' | 'HS256';
  private readonly secret: string;
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly keyId: string;
  private readonly rotatedKeys: Array<{ keyId: string; publicKey: string }>;
  private tokenStorage?: ITokenStorage;

  constructor(
    secretOrOptions?: string | TokenServiceOptions,
    issuer = 'auth-service',
    audience = 'quiz-platform'
  ) {
    let options: TokenServiceOptions = {};

    if (typeof secretOrOptions === 'string') {
      options = {
        secret: secretOrOptions,
        issuer,
        audience,
      };
    } else if (secretOrOptions && typeof secretOrOptions === 'object') {
      options = secretOrOptions;
    }

    this.algorithm = options.algorithm || 'RS256';
    this.secret = options.secret || process.env.JWT_SECRET || 'dev-quiz-platform-secret-key-32-chars-min';
    this.issuer = options.issuer || issuer;
    this.audience = options.audience || audience;
    this.keyId = options.keyId || 'quiz-auth-key-1';
    this.rotatedKeys = options.rotatedKeys || [];
    this.tokenStorage = options.tokenStorage;

    const defaultKeys = getDefaultRsaKeyPair();
    this.privateKey = options.privateKey || defaultKeys.privateKey;
    this.publicKey = options.publicKey || defaultKeys.publicKey;
  }

  private getTokenStorage(): ITokenStorage {
    if (!this.tokenStorage) {
      this.tokenStorage = createTokenStorage();
    }
    return this.tokenStorage;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(str: string): string {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) {
      s += '=';
    }
    return Buffer.from(s, 'base64').toString('utf8');
  }

  getPublicKeyPem(): string {
    return this.publicKey;
  }

  getAlgorithm(): 'RS256' | 'HS256' {
    return this.algorithm;
  }

  generateTokens(
    payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
    options?: { familyId?: string }
  ): AuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = 3600; // 1 hour
    const refreshExpiresIn = 7 * 24 * 3600; // 7 days
    const familyId = options?.familyId || `fam_${crypto.randomBytes(16).toString('hex')}`;

    const header = {
      alg: this.algorithm,
      typ: 'JWT',
      kid: this.keyId,
    };

    const permissions = payload.permissions || resolvePermissionsForRoles(payload.roles);

    const fullPayload: TokenPayload = {
      ...payload,
      permissions,
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      exp: now + accessExpiresIn,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    let signature: string;
    if (this.algorithm === 'RS256') {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(dataToSign);
      signature = sign.sign(this.privateKey, 'base64url');
    } else {
      signature = crypto
        .createHmac('sha256', this.secret)
        .update(dataToSign)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    const accessToken = `${dataToSign}.${signature}`;
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    try {
      const storage = this.getTokenStorage();
      const saveResult = storage.saveRefreshToken(refreshToken, payload.sub, refreshExpiresAt, familyId);
      if (saveResult && typeof (saveResult as any).catch === 'function') {
        (saveResult as Promise<void>).catch((err) => {
          console.error('Failed to persist refresh token to storage:', err);
        });
      }
    } catch (err) {
      console.error('Failed to persist refresh token to storage:', err);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      tokenType: 'Bearer',
      familyId,
    };
  }

  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, signature] = parts;
      const header = JSON.parse(this.base64UrlDecode(encodedHeader));
      const dataToVerify = `${encodedHeader}.${encodedPayload}`;

      if (header.alg === 'RS256') {
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(dataToVerify);
        const isValid = verify.verify(this.publicKey, signature, 'base64url');
        if (!isValid) return null;
      } else if (header.alg === 'HS256') {
        const expectedSignature = crypto
          .createHmac('sha256', this.secret)
          .update(dataToVerify)
          .digest('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');

        if (signature.length !== expectedSignature.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
          return null;
        }
      } else {
        return null;
      }

      const payload: TokenPayload = JSON.parse(this.base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        return null; // Expired
      }

      return payload;
    } catch {
      return null;
    }
  }

  async validateRefreshToken(token: string): Promise<{ userId: string; familyId?: string } | null> {
    return await this.getTokenStorage().validateRefreshToken(token);
  }

  async inspectRefreshToken(token: string): Promise<TokenRecord | null> {
    const storage = this.getTokenStorage();
    if (storage.inspectRefreshToken) {
      return await storage.inspectRefreshToken(token);
    }
    const validation = await storage.validateRefreshToken(token);
    if (!validation) return null;
    return {
      userId: validation.userId,
      familyId: validation.familyId,
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      isRevoked: false,
      isExpired: false,
    };
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    return await this.getTokenStorage().revokeRefreshToken(token);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const storage = this.getTokenStorage();
    if (storage.revokeAllUserTokens) {
      await storage.revokeAllUserTokens(userId);
    }
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    const storage = this.getTokenStorage();
    if (storage.revokeTokenFamily) {
      await storage.revokeTokenFamily(familyId);
    }
  }

  /**
   * RFC 7517 compliant JWKS endpoint response
   */
  getJwks() {
    if (this.algorithm === 'RS256') {
      const keys: Array<{ kty: string; use: string; alg: string; kid: string; n?: string; e?: string }> = [];

      // Primary active key
      try {
        const pubKeyObj = crypto.createPublicKey(this.publicKey);
        const jwk = pubKeyObj.export({ format: 'jwk' });
        keys.push({
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: this.keyId,
          n: jwk.n,
          e: jwk.e,
        });
      } catch {
        // ignore if key export fails
      }

      // Rotated / grace period keys
      for (const rotated of this.rotatedKeys) {
        try {
          const rotKeyObj = crypto.createPublicKey(rotated.publicKey);
          const rotJwk = rotKeyObj.export({ format: 'jwk' });
          keys.push({
            kty: 'RSA',
            use: 'sig',
            alg: 'RS256',
            kid: rotated.keyId,
            n: rotJwk.n,
            e: rotJwk.e,
          });
        } catch {
          // ignore invalid rotated key
        }
      }

      return { keys };
    }

    return {
      keys: [
        {
          kty: 'oct',
          use: 'sig',
          alg: 'HS256',
          kid: this.keyId,
          issuer: this.issuer,
        },
      ],
    };
  }
}
