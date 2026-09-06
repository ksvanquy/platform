import crypto from 'node:crypto';
import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import { Taxonomy } from '../../domain/entities/taxonomy.entity.js';
import {
  TaxonomyNotFoundError,
  DuplicateTaxonomyCodeError,
  TaxonomyValidationError,
} from '../../domain/errors/taxonomy-domain.errors.js';
import type {
  CreateTaxonomyInput,
  UpdateTaxonomyInput,
  TaxonomyDTO,
} from '@platform/contracts';

export class ManageTaxonomyUseCase {
  constructor(private readonly taxonomyRepo: TaxonomyRepositoryPort) {}

  async createTaxonomy(input: CreateTaxonomyInput): Promise<TaxonomyDTO> {
    if (!input.code || !input.code.trim()) {
      throw new TaxonomyValidationError('Taxonomy code is required');
    }
    if (!input.name || !input.name.trim()) {
      throw new TaxonomyValidationError('Taxonomy name is required');
    }

    const code = input.code.trim().toUpperCase();
    const existing = await this.taxonomyRepo.findTaxonomyByIdOrCode(code);
    if (existing) {
      throw new DuplicateTaxonomyCodeError(code);
    }

    const id =
      input.id?.trim() ||
      `tax_${code.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${crypto.randomBytes(3).toString('hex')}`;

    const entity = new Taxonomy({
      id,
      code,
      name: input.name.trim(),
      description: input.description ?? null,
      isHierarchical: input.isHierarchical ?? true,
    });

    const saved = await this.taxonomyRepo.saveTaxonomy(entity);

    return {
      id: saved.id,
      code: saved.code,
      name: saved.name,
      description: saved.description,
      isHierarchical: saved.isHierarchical,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async updateTaxonomy(codeOrId: string, input: UpdateTaxonomyInput): Promise<TaxonomyDTO> {
    const existing = await this.taxonomyRepo.findTaxonomyByIdOrCode(codeOrId);
    if (!existing) {
      throw new TaxonomyNotFoundError(codeOrId);
    }

    existing.update({
      name: input.name,
      description: input.description,
      isHierarchical: input.isHierarchical,
    });

    const updated = await this.taxonomyRepo.saveTaxonomy(existing);

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
      isHierarchical: updated.isHierarchical,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
