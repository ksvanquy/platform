import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  createAuthMiddleware,
  strictAuthMiddleware,
  authContextMiddleware,
  evaluateResourceOwnership,
  requireAuth,
  requireRole,
  requirePermission,
} from '@platform/security';

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
  } as unknown as Request;

  let statusCode = 200;
  let jsonBody: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  };
}

function createRs256Token(payload: Record<string, unknown>, privateKey: string, kid = 'key_1'): string {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${encHeader}.${encPayload}`);
  const signature = sign.sign(privateKey, 'base64url');
  return `${encHeader}.${encPayload}.${signature}`;
}

describe('GIAI ĐOẠN 5: Kiểm định E2E, Security Hardening & Benchmark Dual-Mode', () => {
  let rsaKeyPair: { privateKey: string; publicKey: string };

  beforeAll(() => {
    rsaKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  });

  describe('1. Benchmark Hiệu năng CPU: Strict Mode vs Mesh-Trust Mode', () => {
    it('should demonstrate that Mesh-Trust mode provides >60% CPU time reduction over Strict RSA mode', async () => {
      const iterations = 100;
      const now = Math.floor(Date.now() / 1000);

      // Chuẩn bị token RSA hợp lệ
      const validToken = createRs256Token(
        {
          sub: 'usr_student_bench',
          roles: ['STUDENT'],
          permissions: ['quiz:read', 'quiz:take'],
          exp: now + 3600,
        },
        rsaKeyPair.privateKey
      );

      const strictMiddleware = createAuthMiddleware({
        strictMode: true,
        publicKey: rsaKeyPair.publicKey,
      });

      const meshMiddleware = createAuthMiddleware({
        allowPropagatedHeaders: true,
        strictMode: false,
      });

      // Benchmark Strict Mode (Zero-Trust Asymmetric RSA Verification)
      const startStrict = performance.now();
      for (let i = 0; i < iterations; i++) {
        const { req, res } = createMockReqRes({
          authorization: `Bearer ${validToken}`,
        });
        await strictMiddleware(req, res, () => {});
        expect(req.principal?.id).toBe('usr_student_bench');
      }
      const durationStrict = performance.now() - startStrict;

      // Benchmark Mesh-Trust Mode (Downstream Propagated Headers)
      const startMesh = performance.now();
      for (let i = 0; i < iterations; i++) {
        const { req, res } = createMockReqRes({
          'x-user-id': 'usr_student_bench',
          'x-user-roles': 'STUDENT',
          'x-user-permissions': 'quiz:read,quiz:take',
        });
        await meshMiddleware(req, res, () => {});
        expect(req.principal?.id).toBe('usr_student_bench');
      }
      const durationMesh = performance.now() - startMesh;

      // Tính tỷ lệ tiết kiệm CPU time: (Strict - Mesh) / Strict
      const timeReductionPercentage = ((durationStrict - durationMesh) / durationStrict) * 100;

      // Kiểm tra thực tế: Mesh mode luôn nhanh hơn Strict mode vượt trội
      expect(durationMesh).toBeLessThan(durationStrict);
      expect(timeReductionPercentage).toBeGreaterThanOrEqual(60);
    });

    it('should support serialized x-principal JSON header with high-speed parsing in Mesh Mode', async () => {
      const meshMiddleware = createAuthMiddleware({
        allowPropagatedHeaders: true,
        strictMode: false,
      });

      const principalData = {
        id: 'usr_instructor_speed',
        roles: ['INSTRUCTOR'],
        permissions: ['quiz:create', 'quiz:grade'],
      };

      const { req, res } = createMockReqRes({
        'x-principal': JSON.stringify(principalData),
      });

      await meshMiddleware(req, res, () => {});

      expect(req.principal).toBeDefined();
      expect(req.principal?.id).toBe('usr_instructor_speed');
      expect(req.principal?.roles).toContain('INSTRUCTOR');
      expect(req.principal?.permissions).toContain('quiz:create');
    });
  });

  describe('2. Security Hardening: Anti-Spoofing & Zero-Trust at Boundaries', () => {
    it('should reject spoofed identity headers at Edge Gateway / Strict boundaries', async () => {
      const { req, res } = createMockReqRes({
        'x-user-id': 'usr_attacker',
        'x-user-roles': 'ADMIN',
        'x-principal': JSON.stringify({ id: 'usr_attacker', roles: ['ADMIN'] }),
      });

      await strictAuthMiddleware(req, res, () => {});

      // Under strict mode, without valid Bearer token, req.principal MUST remain undefined
      expect(req.principal).toBeUndefined();

      // Guard check must reject this request with 401
      const guardResult = createMockReqRes();
      guardResult.req.principal = req.principal;
      let nextCalled = false;
      requireAuth(guardResult.req, guardResult.res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(guardResult.getStatusCode()).toBe(401);
    });

    it('should reject tampered JWT signatures in Strict Mode', async () => {
      const now = Math.floor(Date.now() / 1000);
      const validToken = createRs256Token(
        { sub: 'usr_normal', roles: ['STUDENT'], exp: now + 3600 },
        rsaKeyPair.privateKey
      );

      // Sửa đổi payload hoặc chữ ký (tampering)
      const parts = validToken.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.TAMPERED_${parts[2].slice(10)}`;

      const strictMiddleware = createAuthMiddleware({
        strictMode: true,
        publicKey: rsaKeyPair.publicKey,
      });

      const { req, res } = createMockReqRes({
        authorization: `Bearer ${tamperedToken}`,
      });

      await strictMiddleware(req, res, () => {});
      expect(req.principal).toBeUndefined();
    });

    it('should reject expired tokens in Strict Mode', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createRs256Token(
        { sub: 'usr_expired', roles: ['STUDENT'], exp: now - 60 },
        rsaKeyPair.privateKey
      );

      const strictMiddleware = createAuthMiddleware({
        strictMode: true,
        publicKey: rsaKeyPair.publicKey,
      });

      const { req, res } = createMockReqRes({
        authorization: `Bearer ${expiredToken}`,
      });

      await strictMiddleware(req, res, () => {});
      expect(req.principal).toBeUndefined();
    });

    it('should reject token with mismatched RSA public key', async () => {
      const now = Math.floor(Date.now() / 1000);
      const otherKeyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const alienToken = createRs256Token(
        { sub: 'usr_alien', roles: ['STUDENT'], exp: now + 3600 },
        otherKeyPair.privateKey
      );

      const strictMiddleware = createAuthMiddleware({
        strictMode: true,
        publicKey: rsaKeyPair.publicKey, // Khóa khác
      });

      const { req, res } = createMockReqRes({
        authorization: `Bearer ${alienToken}`,
      });

      await strictMiddleware(req, res, () => {});
      expect(req.principal).toBeUndefined();
    });
  });

  describe('3. Resource-Based ABAC Hardening (Pure Functional Evaluation)', () => {
    it('should prevent student from accessing or modifying another student resource', () => {
      const candidatePrincipal = {
        id: 'usr_candidate_01',
        roles: ['STUDENT'],
        permissions: ['attempt:view_own'],
      };

      const evaluation = evaluateResourceOwnership(
        candidatePrincipal,
        { resourceType: 'attempt', resourceId: 'att_123', ownerId: 'usr_candidate_02' },
        'attempt:view_own',
        'attempt:manage_all'
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.isOwner).toBe(false);
      expect(evaluation.reason).toContain('does not own');
    });

    it('should allow student to access their own resource', () => {
      const candidatePrincipal = {
        id: 'usr_candidate_01',
        roles: ['STUDENT'],
        permissions: ['attempt:view_own'],
      };

      const evaluation = evaluateResourceOwnership(
        candidatePrincipal,
        { resourceType: 'attempt', resourceId: 'att_123', ownerId: 'usr_candidate_01' },
        'attempt:view_own',
        'attempt:manage_all'
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.isOwner).toBe(true);
      expect(evaluation.isAdminBypass).toBe(false);
    });

    it('should allow admin or instructor with manageAllPermission to bypass ownership', () => {
      const adminPrincipal = {
        id: 'usr_admin_01',
        roles: ['ADMIN'],
        permissions: ['attempt:view_own', 'attempt:manage_all', '*'],
      };

      const evaluation = evaluateResourceOwnership(
        adminPrincipal,
        { resourceType: 'attempt', resourceId: 'att_999', ownerId: 'usr_candidate_99' },
        'attempt:view_own',
        'attempt:manage_all'
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.isAdminBypass).toBe(true);
    });
  });

  describe('4. Architecture Decoupling Invariants Verification', () => {
    it('should confirm NO file outside services/auth imports getDefaultRsaKeyPair', () => {
      const rootDir = process.cwd();
      const filesToCheck: string[] = [];

      function walkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist'
          ) {
            walkDir(fullPath);
          } else if (
            entry.isFile() &&
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js'))
          ) {
            filesToCheck.push(fullPath);
          }
        }
      }

      walkDir(rootDir);

      const violatingFiles: string[] = [];
      for (const file of filesToCheck) {
        // Chỉ cho phép services/auth chứa khai báo và sử dụng getDefaultRsaKeyPair
        if (file.includes('services/auth')) continue;
        if (file.includes('tests/security-dual-mode-hardening.spec.ts')) continue;

        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('getDefaultRsaKeyPair')) {
          violatingFiles.push(path.relative(rootDir, file));
        }
      }

      expect(violatingFiles).toEqual([]);
    });

    it('should confirm all 5 domain microservices decouple from @platform/auth-service', () => {
      const services = ['assessment', 'exam', 'question', 'attempt', 'taxonomy'];

      for (const svc of services) {
        const pkgPath = path.join(process.cwd(), 'services', svc, 'package.json');
        expect(fs.existsSync(pkgPath)).toBe(true);

        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = {
          ...(pkgJson.dependencies || {}),
          ...(pkgJson.devDependencies || {}),
        };

        // Tuyệt đối không chứa @platform/auth-service
        expect(allDeps['@platform/auth-service']).toBeUndefined();
        // Bắt buộc phải dùng @platform/security
        expect(allDeps['@platform/security']).toBeDefined();
      }
    });

    it('should confirm @platform/contracts is pure types without crypto or auth-service dependency', () => {
      const pkgPath = path.join(process.cwd(), 'packages/contracts/package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = {
        ...(pkgJson.dependencies || {}),
        ...(pkgJson.devDependencies || {}),
      };

      expect(allDeps['@platform/auth-service']).toBeUndefined();
      expect(allDeps['@platform/security']).toBeUndefined();
    });
  });
});
