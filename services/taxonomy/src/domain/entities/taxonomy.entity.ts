export interface TaxonomyProps {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isHierarchical?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Taxonomy {
  readonly id: string;
  readonly code: string;
  name: string;
  description: string | null;
  isHierarchical: boolean;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: TaxonomyProps) {
    this.id = props.id;
    this.code = props.code.toUpperCase().trim();
    this.name = props.name.trim();
    this.description = props.description ?? null;
    this.isHierarchical = props.isHierarchical ?? true;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  update(params: { name?: string; description?: string | null; isHierarchical?: boolean }): void {
    if (params.name !== undefined) this.name = params.name.trim();
    if (params.description !== undefined) this.description = params.description;
    if (params.isHierarchical !== undefined) this.isHierarchical = params.isHierarchical;
    this.updatedAt = new Date();
  }
}

export interface TaxonomyNodeProps {
  id: string;
  taxonomyId: string;
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  status?: string;
  metadata?: Record<string, unknown>;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TaxonomyNode {
  readonly id: string;
  readonly taxonomyId: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: string;
  metadata: Record<string, unknown>;
  deletedAt: Date | null;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: TaxonomyNodeProps) {
    this.id = props.id;
    this.taxonomyId = props.taxonomyId;
    this.parentId = props.parentId ?? null;
    this.name = props.name.trim();
    this.slug = props.slug.trim().toLowerCase();
    this.description = props.description ?? null;
    this.sortOrder = props.sortOrder ?? 0;
    this.status = props.status ?? 'PUBLISHED';
    this.metadata = props.metadata ?? {};
    this.deletedAt = props.deletedAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  isRoot(): boolean {
    return this.parentId === null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  markDeleted(): void {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }

  update(params: {
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
    status?: string;
    metadata?: Record<string, unknown>;
  }): void {
    if (params.name !== undefined) this.name = params.name.trim();
    if (params.slug !== undefined) this.slug = params.slug.trim().toLowerCase();
    if (params.description !== undefined) this.description = params.description;
    if (params.sortOrder !== undefined) this.sortOrder = params.sortOrder;
    if (params.status !== undefined) this.status = params.status;
    if (params.metadata !== undefined) this.metadata = { ...this.metadata, ...params.metadata };
    this.updatedAt = new Date();
  }

  moveTo(newParentId: string | null): void {
    this.parentId = newParentId;
    this.updatedAt = new Date();
  }
}
