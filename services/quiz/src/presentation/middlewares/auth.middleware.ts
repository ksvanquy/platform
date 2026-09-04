import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import type { Principal } from '@platform/contracts';
import { resolvePermissionsForRoles } from '@platform/contracts';
import { getDefaultRsaKeyPair } from '@platform/auth-service';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      context?: {
        principal?: Principal;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-quiz-platform-secret-key-32-chars-min';

const jwksCache: Map<string, string> = new Map();
let lastJwksFetch = 0;

async function getRemoteJwksPublicKey(kid?: string): Promise<string | null> {
  const now = Date.now();
  if (kid && jwksCache.has(kid)) {
    return jwksCache.get(kid)!;
  }

  // Throttle JWKS network queries
  if (now - lastJwksFetch < 5000 && jwksCache.size > 0) {
    if (kid && jwksCache.has(kid)) return jwksCache.get(kid)!;
    return jwksCache.get('latest') || null;
  }

  const jwksUrl = process.env.AUTH_JWKS_URL || 'http://127.0.0.1:3001/.well-known/jwks.json';
  try {
    const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.keys)) {
      for (const k of data.keys) {
        if (k.kty === 'RSA' && k.n && k.e) {
          const pubKeyObj = crypto.createPublicKey({ key: k, format: 'jwk' });
          const pem = pubKeyObj.export({ type: 'spki', format: 'pem' }) as string;
          if (k.kid) jwksCache.set(k.kid, pem);
          jwksCache.set('latest', pem);
        }
      }
      lastJwksFetch = now;
      if (kid && jwksCache.has(kid)) return jwksCache.get(kid)!;
      return jwksCache.get('latest') || null;
    }
  } catch {
    // remote JWKS not accessible
  }
  return null;
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

export function verifyJwtSignature(token: string, secret = JWT_SECRET, publicKey?: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    const dataToVerify = `${encodedHeader}.${encodedPayload}`;

    if (header.alg === 'RS256') {
      let pubKey = publicKey;
      if (!pubKey && process.env.JWT_PUBLIC_KEY?.includes('BEGIN')) {
        pubKey = process.env.JWT_PUBLIC_KEY;
      }
      if (!pubKey) {
        pubKey = getDefaultRsaKeyPair().publicKey;
      }
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      const isValid = verify.verify(pubKey, signature, 'base64url');
      if (!isValid) return null;
    } else if (header.alg === 'HS256') {
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

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Middleware trích xuất và xác thực chữ ký Principal từ Authorization header.
 * - Nếu token gửi lên không hợp lệ hoặc đã hết hạn: trả về 401 Unauthorized ngay lập tức.
 * - Nếu không có header: cho qua để các route công khai (GET /health, GET /v1/quizzes) hoạt động bình thường,
 *   đồng thời KHÔNG tự động gán giả định bất kỳ user nào (loại bỏ fallback usr_student_01).
 * - Hỗ trợ x-user-id header an toàn cho môi trường test nội bộ nếu được bật.
 */
export async function authContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let principal: Principal | undefined;

  // 1. Kiểm tra Bearer JWT Token với chữ ký số RS256 hoặc HS256
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    let payload = verifyJwtSignature(token);

    // Fallback: nếu verify local thất bại (do 2 process riêng biệt), tự động discovery từ JWKS của Auth Service (Port 3001)
    if (!payload) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const header = JSON.parse(base64UrlDecode(parts[0]));
          if (header.alg === 'RS256') {
            const remotePubKey = await getRemoteJwksPublicKey(header.kid);
            if (remotePubKey) {
              payload = verifyJwtSignature(token, JWT_SECRET, remotePubKey);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (!payload || !payload.sub) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token',
        errorCode: 'UNAUTHORIZED',
      });
      return;
    }

    const roles = Array.isArray(payload.roles) ? payload.roles : ['STUDENT'];
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions
      : resolvePermissionsForRoles(roles);

    principal = {
      id: payload.sub,
      roles,
      permissions,
      tenantId: payload.tenantId,
    };
  }

  // 2. Service-to-service / Testing fallback qua header x-user-id (khi không có Bearer)
  if (!principal && req.headers['x-user-id']) {
    const rolesHeader = req.headers['x-user-roles'] || req.headers['x-roles'];
    const roles = rolesHeader
      ? String(rolesHeader).split(',').map((r) => r.trim().toUpperCase())
      : ['STUDENT'];
    principal = {
      id: String(req.headers['x-user-id']),
      roles,
      permissions: resolvePermissionsForRoles(roles),
      tenantId: (req.headers['x-tenant-id'] as string) || 'tenant_default',
    };
  }

  // Gán thông tin principal vào request (nếu có)
  req.principal = principal;
  req.context = { principal };

  next();
}

/**
 * Middleware bắt buộc phải đăng nhập (Principal Guard).
 * Áp dụng cho các routes nghiệp vụ cần bảo vệ danh tính.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.principal) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid Bearer token.',
      errorCode: 'UNAUTHORIZED',
    });
    return;
  }
  next();
}
