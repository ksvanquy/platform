import { Router } from 'express';
import type { TaxonomyController } from '../controllers/taxonomy.controller.js';
import { requireAdmin } from '../middlewares/auth.middleware.js';

export function createTaxonomiesRouter(controller: TaxonomyController): Router {
  const router = Router();

  // Public reads
  router.get('/', controller.listTaxonomies);
  router.get('/:codeOrId', controller.getTaxonomy);
  router.get('/:codeOrId/tree', controller.getTaxonomyTree);

  // Admin writes
  router.post('/', requireAdmin, controller.createTaxonomy);
  router.put('/:codeOrId', requireAdmin, controller.updateTaxonomy);
  router.post('/:codeOrId/nodes', requireAdmin, controller.createNode);

  return router;
}
