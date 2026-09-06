import type { Request, Response } from 'express';
import { ListTaxonomiesUseCase } from '../../application/use-cases/list-taxonomies.use-case.js';
import { GetTaxonomyTreeUseCase } from '../../application/use-cases/get-taxonomy-tree.use-case.js';
import { ManageTaxonomyUseCase } from '../../application/use-cases/manage-taxonomy.use-case.js';
import { ManageNodeUseCase } from '../../application/use-cases/manage-node.use-case.js';
import {
  TaxonomyNotFoundError,
  TaxonomyNodeNotFoundError,
  DuplicateTaxonomyCodeError,
  DuplicateNodeSlugError,
  CycleDetectedError,
  InvalidHierarchyError,
  TaxonomyValidationError,
} from '../../domain/errors/taxonomy-domain.errors.js';
import type { ApiResponse } from '@platform/contracts';

export class TaxonomyController {
  constructor(
    private readonly listTaxonomiesUseCase: ListTaxonomiesUseCase,
    private readonly getTaxonomyTreeUseCase: GetTaxonomyTreeUseCase,
    private readonly manageTaxonomyUseCase: ManageTaxonomyUseCase,
    private readonly manageNodeUseCase: ManageNodeUseCase
  ) {}

  private handleError(res: Response, error: unknown): void {
    if (error instanceof TaxonomyNotFoundError || error instanceof TaxonomyNodeNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
        message: error.message,
      } as ApiResponse);
      return;
    }

    if (
      error instanceof DuplicateTaxonomyCodeError ||
      error instanceof DuplicateNodeSlugError ||
      error instanceof CycleDetectedError ||
      error instanceof InvalidHierarchyError ||
      error instanceof TaxonomyValidationError
    ) {
      res.status(400).json({
        success: false,
        error: error.message,
        message: error.message,
      } as ApiResponse);
      return;
    }

    console.error('Unhandled TaxonomyController Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error in taxonomy service',
      message: (error as Error)?.message || 'Internal server error',
    } as ApiResponse);
  }

  listTaxonomies = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.listTaxonomiesUseCase.execute();
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getTaxonomy = async (req: Request, res: Response): Promise<void> => {
    try {
      const codeOrId = req.params.codeOrId as string;
      const data = await this.getTaxonomyTreeUseCase.execute(codeOrId);
      res.json({
        success: true,
        data: data.taxonomy,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  createTaxonomy = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.manageTaxonomyUseCase.createTaxonomy(req.body);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  updateTaxonomy = async (req: Request, res: Response): Promise<void> => {
    try {
      const codeOrId = req.params.codeOrId as string;
      const data = await this.manageTaxonomyUseCase.updateTaxonomy(codeOrId, req.body);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getTaxonomyTree = async (req: Request, res: Response): Promise<void> => {
    try {
      const codeOrId = req.params.codeOrId as string;
      const data = await this.getTaxonomyTreeUseCase.execute(codeOrId);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  createNode = async (req: Request, res: Response): Promise<void> => {
    try {
      const codeOrId = req.params.codeOrId as string;
      const data = await this.manageNodeUseCase.createNode(codeOrId, req.body);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getNode = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = await this.manageNodeUseCase.getNode(id);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  updateNode = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = await this.manageNodeUseCase.updateNode(id, req.body);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  moveNode = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = await this.manageNodeUseCase.moveNode(id, req.body);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  deleteNode = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      await this.manageNodeUseCase.deleteNode(id);
      res.json({
        success: true,
        message: `Node ${id} deleted successfully`,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getDescendantIds = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = await this.manageNodeUseCase.getDescendantIds(id);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getBreadcrumbs = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = await this.manageNodeUseCase.getBreadcrumbs(id);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };
}
