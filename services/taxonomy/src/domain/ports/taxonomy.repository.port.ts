import type { Taxonomy, TaxonomyNode } from '../entities/taxonomy.entity.js';
import type { BreadcrumbItemDTO } from '@platform/contracts';

export interface TaxonomyRepositoryPort {
  findTaxonomies(): Promise<Taxonomy[]>;
  findTaxonomyByIdOrCode(idOrCode: string): Promise<Taxonomy | null>;
  saveTaxonomy(taxonomy: Taxonomy): Promise<Taxonomy>;
  updateTaxonomy(id: string, updates: Partial<Taxonomy>): Promise<Taxonomy>;

  findNodesByTaxonomyId(taxonomyId: string, includeDeleted?: boolean): Promise<TaxonomyNode[]>;
  findNodeById(id: string): Promise<TaxonomyNode | null>;
  findNodeBySlug(taxonomyId: string, slug: string): Promise<TaxonomyNode | null>;
  saveNode(node: TaxonomyNode): Promise<TaxonomyNode>;
  updateNode(id: string, updates: Partial<TaxonomyNode>): Promise<TaxonomyNode>;
  softDeleteNode(id: string): Promise<void>;

  findDescendantIds(rootNodeId: string): Promise<string[]>;
  findBreadcrumbs(nodeId: string): Promise<BreadcrumbItemDTO[]>;
  isDescendant(potentialAncestorId: string, potentialDescendantId: string): Promise<boolean>;
}
