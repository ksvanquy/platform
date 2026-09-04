import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

export class LoginRateLimiter {
  private readonly attempts: Map<string, AttemptRecord> = new Map();
  private readonly maxFailures: number;
  private readonly lockDurationMs: number; // 15 phút

  constructor(maxFailures = 5, lockDurationMinutes = 15) {
    this.maxFailures = maxFailures;
    this.lockDurationMs = lockDurationMinutes * 60 * 1000;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown-ip';
  }

  isLocked(ip: string): { locked: boolean; retryAfterSeconds?: number } {
    const record = this.attempts.get(ip);
    if (!record || !record.lockedUntil) {
      return { locked: false };
    }

    const now = Date.now();
    if (now >= record.lockedUntil) {
      // Đã hết thời gian khóa
      this.attempts.delete(ip);
      return { locked: false };
    }

    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, retryAfterSeconds };
  }

  recordFailure(ip: string): { locked: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = this.attempts.get(ip) || {
      failures: 0,
      lockedUntil: null,
      lastAttempt: now,
    };

    // Nếu lần thử trước đã quá thời gian cửa sổ mà chưa bị khóa, reset đếm
    if (now - record.lastAttempt > this.lockDurationMs && !record.lockedUntil) {
      record.failures = 0;
    }

    record.failures += 1;
    record.lastAttempt = now;

    if (record.failures >= this.maxFailures) {
      record.lockedUntil = now + this.lockDurationMs;
      this.attempts.set(ip, record);
      return {
        locked: true,
        retryAfterSeconds: Math.ceil(this.lockDurationMs / 1000),
      };
    }

    this.attempts.set(ip, record);
    return { locked: false };
  }

  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  reset(): void {
    this.attempts.clear();
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = this.getClientIp(req);
      const { locked, retryAfterSeconds } = this.isLocked(ip);

      if (locked && retryAfterSeconds !== undefined) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Please try again after ${retryAfterSeconds} seconds.`,
          errorCode: 'TOO_MANY_REQUESTS',
          retryAfter: retryAfterSeconds,
        });
        return;
      }

      next();
    };
  }
}

export const defaultLoginRateLimiter = new LoginRateLimiter(5, 15);
