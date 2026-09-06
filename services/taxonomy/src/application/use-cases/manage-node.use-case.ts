import crypto from 'node:crypto';
import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import { TaxonomyNode } from '../../domain/entities/taxonomy.entity.js';
import {
  TaxonomyNotFoundError,
  TaxonomyNodeNotFoundError,
  DuplicateNodeSlugError,
  CycleDetectedError,
  InvalidHierarchyError,
  TaxonomyValidationError,
} from '../../domain/errors/taxonomy-domain.errors.js';
import type {
  CreateNodeInput,
  UpdateNodeInput,
  MoveNodeInput,
  TaxonomyNodeDTO,
  BreadcrumbItemDTO,
} from '@platform/contracts';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ManageNodeUseCase {
  constructor(private readonly taxonomyRepo: TaxonomyRepositoryPort) {}

  private mapToDTO(node: TaxonomyNode): TaxonomyNodeDTO {
    return {
      id: node.id,
      taxonomyId: node.taxonomyId,
      parentId: node.parentId,
      name: node.name,
      slug: node.slug,
      description: node.description,
      sortOrder: node.sortOrder,
      status: node.status,
      metadata: node.metadata,
      deletedAt: node.deletedAt ? node.deletedAt.toISOString() : null,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  async getNode(id: string): Promise<TaxonomyNodeDTO> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }
    return this.mapToDTO(node);
  }

  async createNode(codeOrId: string, input: CreateNodeInput): Promise<TaxonomyNodeDTO> {
    const taxonomy = await this.taxonomyRepo.findTaxonomyByIdOrCode(codeOrId);
    if (!taxonomy) {
      throw new TaxonomyNotFoundError(codeOrId);
    }

    if (!input.name || !input.name.trim()) {
      throw new TaxonomyValidationError('Node name is required');
    }

    const parentId = input.parentId?.trim() || null;

    if (!taxonomy.isHierarchical && parentId !== null) {
      throw new InvalidHierarchyError(
        `Taxonomy '${taxonomy.name}' is flat (non-hierarchical). Nodes cannot have a parent.`
      );
    }

    if (parentId !== null) {
      const parentNode = await this.taxonomyRepo.findNodeById(parentId);
      if (!parentNode) {
        throw new TaxonomyNodeNotFoundError(parentId);
      }
      if (parentNode.taxonomyId !== taxonomy.id) {
        throw new InvalidHierarchyError('Parent node does not belong to the same taxonomy');
      }
    }

    const slug = input.slug?.trim() ? slugify(input.slug) : slugify(input.name);
    if (!slug) {
      throw new TaxonomyValidationError('Node slug could not be generated from the given name');
    }

    const existingSlug = await this.taxonomyRepo.findNodeBySlug(taxonomy.id, slug);
    if (existingSlug) {
      throw new DuplicateNodeSlugError(taxonomy.id, slug);
    }

    const id =
      input.id?.trim() ||
      `node_${slug.replace(/[^a-z0-9_]/g, '_')}_${crypto.randomBytes(3).toString('hex')}`;

    const entity = new TaxonomyNode({
      id,
      taxonomyId: taxonomy.id,
      parentId,
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? 'PUBLISHED',
      metadata: input.metadata ?? {},
    });

    const saved = await this.taxonomyRepo.saveNode(entity);
    return this.mapToDTO(saved);
  }

  async updateNode(id: string, input: UpdateNodeInput): Promise<TaxonomyNodeDTO> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }

    let slug: string | undefined = undefined;
    if (input.slug !== undefined || (input.name !== undefined && !input.slug)) {
      const candidate = input.slug !== undefined ? input.slug : input.name!;
      const normalized = slugify(candidate);
      if (normalized && normalized !== node.slug) {
        const existing = await this.taxonomyRepo.findNodeBySlug(node.taxonomyId, normalized);
        if (existing && existing.id !== node.id) {
          throw new DuplicateNodeSlugError(node.taxonomyId, normalized);
        }
        slug = normalized;
      }
    }

    node.update({
      name: input.name,
      slug,
      description: input.description,
      sortOrder: input.sortOrder,
      status: input.status,
      metadata: input.metadata,
    });

    const updated = await this.taxonomyRepo.saveNode(node);
    return this.mapToDTO(updated);
  }

  async moveNode(id: string, input: MoveNodeInput): Promise<TaxonomyNodeDTO> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }

    const newParentId = input.newParentId?.trim() || null;

    // Di chuyển tới cùng 1 cha hiện tại -> idempotent return
    if (newParentId === node.parentId) {
      return this.mapToDTO(node);
    }

    if (newParentId !== null) {
      // Check if taxonomy is hierarchical
      const taxonomy = await this.taxonomyRepo.findTaxonomyByIdOrCode(node.taxonomyId);
      if (taxonomy && !taxonomy.isHierarchical) {
        throw new InvalidHierarchyError(
          `Taxonomy '${taxonomy.name}' is flat (non-hierarchical). Nodes cannot have a parent.`
        );
      }

      // 1. Kiểm tra node cha có tồn tại không
      const parentNode = await this.taxonomyRepo.findNodeById(newParentId);
      if (!parentNode) {
        throw new TaxonomyNodeNotFoundError(newParentId);
      }

      // 2. Phải cùng taxonomy
      if (parentNode.taxonomyId !== node.taxonomyId) {
        throw new InvalidHierarchyError('Cannot move node under a parent from a different taxonomy');
      }

      // 3. Chống chu kỳ (Cycle prevention): Node cha mới KHÔNG ĐƯỢC là chính node này hoặc bất kỳ con cháu nào của node này!
      const isCycle = await this.taxonomyRepo.isDescendant(node.id, newParentId);
      if (isCycle) {
        throw new CycleDetectedError(node.id, newParentId);
      }
    }

    node.moveTo(newParentId);
    const updated = await this.taxonomyRepo.saveNode(node);
    return this.mapToDTO(updated);
  }

  async deleteNode(id: string): Promise<void> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }
    await this.taxonomyRepo.softDeleteNode(id);
  }

  async getDescendantIds(id: string): Promise<{ rootId: string; descendantIds: string[] }> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }
    const descendantIds = await this.taxonomyRepo.findDescendantIds(id);
    return {
      rootId: id,
      descendantIds,
    };
  }

  async getBreadcrumbs(id: string): Promise<BreadcrumbItemDTO[]> {
    const node = await this.taxonomyRepo.findNodeById(id);
    if (!node) {
      throw new TaxonomyNodeNotFoundError(id);
    }
    return this.taxonomyRepo.findBreadcrumbs(id);
  }
}
