import { Router } from 'express';
import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import { DrizzleTaxonomyRepository } from '../../infrastructure/repositories/drizzle-taxonomy.repository.js';
import { ListTaxonomiesUseCase } from '../../application/use-cases/list-taxonomies.use-case.js';
import { GetTaxonomyTreeUseCase } from '../../application/use-cases/get-taxonomy-tree.use-case.js';
import { ManageTaxonomyUseCase } from '../../application/use-cases/manage-taxonomy.use-case.js';
import { ManageNodeUseCase } from '../../application/use-cases/manage-node.use-case.js';
import { TaxonomyController } from '../controllers/taxonomy.controller.js';
import { authContextMiddleware } from '../middlewares/auth.middleware.js';
import { createTaxonomiesRouter } from './v1-taxonomies.routes.js';
import { createNodesRouter } from './v1-nodes.routes.js';

export interface TaxonomyModule {
  repo: TaxonomyRepositoryPort;
  controller: TaxonomyController;
  taxonomiesRouter: Router;
  nodesRouter: Router;
  combinedRouter: Router;
}

export function createTaxonomyModule(customRepo?: TaxonomyRepositoryPort): TaxonomyModule {
  const repo = customRepo || new DrizzleTaxonomyRepository();

  const listTaxonomiesUseCase = new ListTaxonomiesUseCase(repo);
  const getTaxonomyTreeUseCase = new GetTaxonomyTreeUseCase(repo);
  const manageTaxonomyUseCase = new ManageTaxonomyUseCase(repo);
  const manageNodeUseCase = new ManageNodeUseCase(repo);

  const controller = new TaxonomyController(
    listTaxonomiesUseCase,
    getTaxonomyTreeUseCase,
    manageTaxonomyUseCase,
    manageNodeUseCase
  );

  const taxonomiesRouter = createTaxonomiesRouter(controller);
  const nodesRouter = createNodesRouter(controller);

  const combinedRouter = Router();
  combinedRouter.use(authContextMiddleware);
  combinedRouter.use('/taxonomies', taxonomiesRouter);
  combinedRouter.use('/nodes', nodesRouter);

  return {
    repo,
    controller,
    taxonomiesRouter,
    nodesRouter,
    combinedRouter,
  };
}

export function createTaxonomyRouter(customRepo?: TaxonomyRepositoryPort): Router {
  const module = createTaxonomyModule(customRepo);
  return module.combinedRouter;
}
