import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import express, { Express } from 'express';
import { TokenService } from '../src/infrastructure/token/token.service.js';
import { createAuthApp } from '../src/presentation/server.js';
import { JwksClient, verifyJwtTokenAsync } from '@platform/security';

describe('Auth Service Phase 2: IdP & JWKS Standardization (RFC 7517)', () => {
  let authApp: Express;
  let tokenService: TokenService;

  beforeAll(() => {
    const instance = createAuthApp();
    authApp = instance.app;
    tokenService = instance.tokenService;
  });

  it('1. GET /.well-known/jwks.json should return RFC 7517 compliant JWK Set with proper Cache-Control', async () => {
    // Simulate HTTP request
    const req = {
      method: 'GET',
      url: '/.well-known/jwks.json',
      headers: {},
    };

    let statusCode = 0;
    let headers: Record<string, string> = {};
    let body = '';

    const res = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(data: string) {
        body = data;
        statusCode = 200;
        return this;
      },
      json(data: unknown) {
        body = JSON.stringify(data);
        statusCode = 200;
        return this;
      },
    };

    // Invoke Express handle
    (authApp as any).handle(req, res);

    expect(statusCode).toBe(200);
    expect(headers['cache-control']).toBeDefined();
    expect(headers['cache-control']).toContain('public, max-age=3600');
    expect(headers['etag']).toBeDefined();

    const jwks = JSON.parse(body);
    expect(jwks).toHaveProperty('keys');
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThanOrEqual(1);

    const primaryKey = jwks.keys[0];
    expect(primaryKey.kty).toBe('RSA');
    expect(primaryKey.use).toBe('sig');
    expect(primaryKey.alg).toBe('RS256');
    expect(primaryKey.kid).toBeDefined();
    expect(primaryKey.n).toBeDefined();
    expect(primaryKey.e).toBeDefined();
  });

  it('2. GET /v1/auth/jwks should return matching JWK Set with caching headers', async () => {
    const req = {
      method: 'GET',
      url: '/v1/auth/jwks',
      headers: {},
    };

    let statusCode = 0;
    let headers: Record<string, string> = {};
    let body = '';

    const res = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(data: string) {
        body = data;
        statusCode = 200;
        return this;
      },
      json(data: unknown) {
        body = JSON.stringify(data);
        statusCode = 200;
        return this;
      },
    };

    (authApp as any).handle(req, res);

    expect(statusCode).toBe(200);
    expect(headers['cache-control']).toContain('public, max-age=3600');
    const jwks = JSON.parse(body);
    expect(jwks.keys[0].kty).toBe('RSA');
  });

  it('3. Key Rotation: TokenService should serve multiple valid keys in JWKS', () => {
    const { publicKey: rotPub } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const rotatingTokenService = new TokenService({
      keyId: 'key_v2_active',
      rotatedKeys: [
        {
          keyId: 'key_v1_legacy',
          publicKey: rotPub,
        },
      ],
    });

    const jwks = rotatingTokenService.getJwks();
    expect(jwks.keys.length).toBe(2);
    expect(jwks.keys[0].kid).toBe('key_v2_active');
    expect(jwks.keys[1].kid).toBe('key_v1_legacy');
    expect(jwks.keys[1].kty).toBe('RSA');
  });

  it('4. Integration with @platform/security JwksClient and verifyJwtTokenAsync', async () => {
    // Generate token from auth service
    const tokens = tokenService.generateTokens({
      sub: 'usr_student_99',
      roles: ['STUDENT'],
      permissions: ['quiz:read', 'attempt:start'],
      email: 'student99@quiz.com',
    });

    // Create JwksClient in security SDK pre-populated with Auth Service's JWKS
    const jwks = tokenService.getJwks();
    const securityJwksClient = new JwksClient();
    
    // Import key into JwksClient cache
    const primaryKey = jwks.keys[0];
    const pubKeyObj = crypto.createPublicKey({ key: primaryKey, format: 'jwk' });
    const pem = pubKeyObj.export({ type: 'spki', format: 'pem' }) as string;
    securityJwksClient.setCachedKey(primaryKey.kid, pem);

    // Verify token using @platform/security
    const verifiedPayload = await verifyJwtTokenAsync(tokens.accessToken, {
      jwksClient: securityJwksClient,
    });

    expect(verifiedPayload).not.toBeNull();
    expect(verifiedPayload?.sub).toBe('usr_student_99');
    expect(verifiedPayload?.roles).toContain('STUDENT');
    expect(verifiedPayload?.permissions).toContain('quiz:read');
  });
});
