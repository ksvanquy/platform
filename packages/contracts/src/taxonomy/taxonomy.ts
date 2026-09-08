export interface TaxonomyDTO {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isHierarchical: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const STANDARD_TAXONOMY_CODES = {
  TOPIC: 'TOPIC',
  DIFFICULTY: 'DIFFICULTY',
  TAG: 'TAG',
  GRADE: 'GRADE',
} as const;

export type StandardTaxonomyCode =
  (typeof STANDARD_TAXONOMY_CODES)[keyof typeof STANDARD_TAXONOMY_CODES];

export interface TaxonomyNodeDTO {
  id: string;
  taxonomyId: string;
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  status: string; // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  metadata?: Record<string, unknown>;
  deletedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface TaxonomyTreeNodeDTO extends TaxonomyNodeDTO {
  children: TaxonomyTreeNodeDTO[];
}

export interface TaxonomyTreeDTO {
  taxonomy: TaxonomyDTO;
  tree: TaxonomyTreeNodeDTO[];
}

export interface BreadcrumbItemDTO {
  id: string;
  name: string;
  slug: string;
}

export interface CreateTaxonomyInput {
  id?: string;
  code: string;
  name: string;
  description?: string;
  isHierarchical?: boolean;
}

export interface UpdateTaxonomyInput {
  name?: string;
  description?: string;
  isHierarchical?: boolean;
}

export interface CreateNodeInput {
  id?: string;
  parentId?: string | null;
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateNodeInput {
  name?: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface MoveNodeInput {
  newParentId: string | null;
}
