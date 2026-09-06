import { Router } from 'express';
import type { TaxonomyController } from '../controllers/taxonomy.controller.js';
import { requireAdmin } from '../middlewares/auth.middleware.js';

export function createNodesRouter(controller: TaxonomyController): Router {
  const router = Router();

  // Public reads
  router.get('/:id', controller.getNode);
  router.get('/:id/descendant-ids', controller.getDescendantIds);
  router.get('/:id/breadcrumbs', controller.getBreadcrumbs);

  // Admin writes
  router.put('/:id', requireAdmin, controller.updateNode);
  router.post('/:id/move', requireAdmin, controller.moveNode);
  router.delete('/:id', requireAdmin, controller.deleteNode);

  return router;
}
