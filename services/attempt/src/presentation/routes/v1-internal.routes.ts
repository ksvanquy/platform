import { Router, Request, Response } from 'express';
import { AttemptExpirySweeperService } from '../../domain/services/attempt-expiry-sweeper.service.js';

export function createV1InternalRouter(sweeperService: AttemptExpirySweeperService): Router {
  const router = Router();

  const EXPECTED_SECRET = process.env.INTERNAL_SWEEPER_SECRET || 'internal-quiz-sweeper-secret';

  const internalAuthMiddleware = (req: Request, res: Response, next: () => void) => {
    const headerSecret = req.headers['x-internal-secret'] as string | undefined;
    const bearerHeader = req.headers['authorization'];
    const bearerToken = bearerHeader?.startsWith('Bearer ') ? bearerHeader.substring(7) : undefined;
    const paramSecret = (req.query.secret as string) || (req.body && req.body.secret);

    const providedSecret = headerSecret || bearerToken || paramSecret;

    // 1. Kiểm tra secret key nội bộ (Cloud Scheduler)
    if (providedSecret && providedSecret === EXPECTED_SECRET) {
      return next();
    }

    // 2. Kiểm tra quyền ADMIN từ Auth Context
    const principal = req.principal;
    if (principal && (principal.roles.includes('ADMIN') || principal.roles.includes('SUPER_ADMIN'))) {
      return next();
    }

    res.status(403).json({
      success: false,
      message: 'Forbidden: Invalid or missing internal sweeper secret or insufficient admin permissions',
      errorCode: 'FORBIDDEN_INTERNAL_ACCESS',
    });
  };

  /**
   * POST /v1/internal/attempts/sweep
   * Kích hoạt quét và cưỡng chế thu bài các ca thi quá hạn
   */
  router.post('/attempts/sweep', internalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const gracePeriodMs = req.body?.gracePeriodMs !== undefined ? Number(req.body.gracePeriodMs) : 15000;
      const now = req.body?.simulatedNow ? new Date(req.body.simulatedNow) : new Date();

      const result = await sweeperService.sweep(now, gracePeriodMs);

      res.status(200).json({
        success: true,
        message: `Successfully swept ${result.sweptCount} expired attempt(s)`,
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message || 'Internal error during attempt sweep execution',
      });
    }
  });

  /**
   * GET /v1/internal/attempts/sweeper-status
   * Kiểm tra tình trạng hoạt động của Background Sweeper Daemon
   */
  router.get('/attempts/sweeper-status', internalAuthMiddleware, (_req: Request, res: Response) => {
    const status = sweeperService.getStatus();
    res.status(200).json({
      success: true,
      data: status,
    });
  });

  return router;
}
