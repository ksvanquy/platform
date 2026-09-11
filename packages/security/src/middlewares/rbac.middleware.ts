import type { Request, Response, NextFunction } from 'express';
import type { Principal, OwnedResource } from '@platform/contracts';
import { hasPermission, hasAnyRole } from '../authorization/rbac-evaluator.js';
import { evaluateResourceOwnership } from '../authorization/abac-ownership.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal || req.context?.principal;
  if (!principal || !principal.id) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required',
    });
    return;
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal || req.context?.principal;
    if (!principal || !principal.id) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    if (!hasAnyRole(principal, allowedRoles)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Requires one of roles: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}

export const requireRoles = requireRole;

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal || req.context?.principal;
    if (!principal || !principal.id) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    if (!hasPermission(principal, permission)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Missing required permission [${permission}]`,
      });
      return;
    }

    next();
  };
}

export function requirePermissions(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal || req.context?.principal;
    if (!principal || !principal.id) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    const hasAll = permissions.every((p) => hasPermission(principal, p));
    if (!hasAll) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Missing required permissions [${permissions.join(', ')}]`,
      });
      return;
    }

    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal || req.context?.principal;
  if (!principal || !principal.id) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required',
    });
    return;
  }

  const isAdmin = principal.roles.includes('ADMIN') || (principal.permissions && principal.permissions.includes('*'));
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Admin access required',
    });
    return;
  }

  next();
}

export function requireAuthor(getResource: (req: Request) => Promise<OwnedResource | null> | OwnedResource | null, requiredPermission = 'quiz:write') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = req.principal || req.context?.principal;
    if (!principal || !principal.id) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    const resource = await getResource(req);
    if (!resource) {
      res.status(404).json({
        success: false,
        error: 'Resource not found',
      });
      return;
    }

    const evaluation = evaluateResourceOwnership(principal, resource, requiredPermission);
    if (!evaluation.allowed) {
      res.status(403).json({
        success: false,
        error: evaluation.reason || 'Forbidden: You do not own this resource',
      });
      return;
    }

    next();
  };
}
