import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface JwksClientOptions {
  jwksUrl?: string;
  cacheTtlMs?: number;
  throttleIntervalMs?: number;
  timeoutMs?: number;
  defaultPublicKey?: string;
}

function getSharedDevKeyPath(): string {
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

export class JwksClient {
  private readonly jwksUrl: string;
  private readonly cacheTtlMs: number;
  private readonly throttleIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly defaultPublicKey?: string;

  private keyCache: Map<string, { pem: string; fetchedAt: number }> = new Map();
  private lastFetchTime = 0;

  constructor(options: JwksClientOptions = {}) {
    this.jwksUrl = options.jwksUrl || process.env.AUTH_JWKS_URL || 'http://127.0.0.1:3001/.well-known/jwks.json';
    this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000; // 1 hour default TTL
    this.throttleIntervalMs = options.throttleIntervalMs ?? 5000; // 5s throttle on network requests
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.defaultPublicKey = options.defaultPublicKey || process.env.JWT_PUBLIC_KEY;
  }

  public setCachedKey(kid: string, pem: string): void {
    this.keyCache.set(kid, { pem, fetchedAt: Date.now() });
    this.keyCache.set('latest', { pem, fetchedAt: Date.now() });
  }

  public getCachedKey(kid?: string): string | null {
    const keyId = kid || 'latest';
    const cached = this.keyCache.get(keyId);
    if (cached) {
      if (Date.now() - cached.fetchedAt <= this.cacheTtlMs) {
        return cached.pem;
      }
    }

    // Try reading local dev key file if exists
    try {
      const devKeyPath = getSharedDevKeyPath();
      if (fs.existsSync(devKeyPath)) {
        const content = JSON.parse(fs.readFileSync(devKeyPath, 'utf8'));
        if (content?.publicKey) {
          this.setCachedKey(kid || 'dev-key-1', content.publicKey);
          return content.publicKey;
        }
      }
    } catch {
      // Ignore
    }

    return null;
  }

  public async getPublicKey(kid?: string): Promise<string | null> {
    const cached = this.getCachedKey(kid);
    if (cached) return cached;

    const now = Date.now();
    // Throttle queries to avoid flooding IdP
    if (now - this.lastFetchTime < this.throttleIntervalMs && this.keyCache.size > 0) {
      return this.getCachedKey(kid) || (this.keyCache.get('latest')?.pem ?? null);
    }

    try {
      const res = await fetch(this.jwksUrl, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (res.ok) {
        const data = await res.json() as { keys?: Array<{ kty: string; kid?: string; n?: string; e?: string }> };
        if (data && Array.isArray(data.keys)) {
          for (const k of data.keys) {
            if (k.kty === 'RSA' && k.n && k.e) {
              const pubKeyObj = crypto.createPublicKey({ key: k, format: 'jwk' });
              const pem = pubKeyObj.export({ type: 'spki', format: 'pem' }) as string;
              if (k.kid) {
                this.keyCache.set(k.kid, { pem, fetchedAt: now });
              }
              this.keyCache.set('latest', { pem, fetchedAt: now });
            }
          }
          this.lastFetchTime = now;
          const freshKey = this.getCachedKey(kid) || this.keyCache.get('latest')?.pem;
          if (freshKey) return freshKey;
        }
      }
    } catch {
      // Remote JWKS unavailable, fall back to environment or default key
    }

    if (this.defaultPublicKey) {
      return this.defaultPublicKey;
    }

    // Try dev key file
    try {
      const devKeyPath = getSharedDevKeyPath();
      if (fs.existsSync(devKeyPath)) {
        const content = JSON.parse(fs.readFileSync(devKeyPath, 'utf8'));
        if (content?.publicKey) {
          this.setCachedKey(kid || 'dev-key-1', content.publicKey);
          return content.publicKey;
        }
      }
    } catch {
      // Ignore
    }

    return null;
  }

  public clearCache(): void {
    this.keyCache.clear();
    this.lastFetchTime = 0;
  }
}

// Global default instance for convenience
export const defaultJwksClient = new JwksClient();

