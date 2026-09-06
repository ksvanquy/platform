import { eq, and, isNull, sql } from 'drizzle-orm';
import type { TaxonomyRepositoryPort } from '../../domain/ports/taxonomy.repository.port.js';
import { Taxonomy, TaxonomyNode } from '../../domain/entities/taxonomy.entity.js';
import { taxonomies, taxonomyNodes, type TaxonomyRow, type TaxonomyNodeRow } from '../db/schema.js';
import { getTaxonomyDb } from '../db/connection.js';
import type { BreadcrumbItemDTO } from '@platform/contracts';

export class DrizzleTaxonomyRepository implements TaxonomyRepositoryPort {
  private db: ReturnType<typeof getTaxonomyDb>;

  constructor(db?: ReturnType<typeof getTaxonomyDb>) {
    this.db = db || getTaxonomyDb();
  }

  private mapTaxonomyToDomain(row: TaxonomyRow): Taxonomy {
    return new Taxonomy({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isHierarchical: row.isHierarchical,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapNodeToDomain(row: TaxonomyNodeRow): TaxonomyNode {
    return new TaxonomyNode({
      id: row.id,
      taxonomyId: row.taxonomyId,
      parentId: row.parentId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      status: row.status,
      metadata: (row.metadata as Record<string, unknown>) || {},
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findTaxonomies(): Promise<Taxonomy[]> {
    const rows = await this.db.select().from(taxonomies).orderBy(taxonomies.code);
    return rows.map((r) => this.mapTaxonomyToDomain(r));
  }

  async findTaxonomyByIdOrCode(idOrCode: string): Promise<Taxonomy | null> {
    const upper = idOrCode.trim().toUpperCase();
    const rows = await this.db
      .select()
      .from(taxonomies)
      .where(sql`${taxonomies.id} = ${idOrCode} OR UPPER(${taxonomies.code}) = ${upper}`)
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapTaxonomyToDomain(rows[0]);
  }

  async saveTaxonomy(taxonomy: Taxonomy): Promise<Taxonomy> {
    await this.db
      .insert(taxonomies)
      .values({
        id: taxonomy.id,
        code: taxonomy.code,
        name: taxonomy.name,
        description: taxonomy.description,
        isHierarchical: taxonomy.isHierarchical,
        createdAt: taxonomy.createdAt,
        updatedAt: taxonomy.updatedAt,
      })
      .onConflictDoUpdate({
        target: taxonomies.id,
        set: {
          name: taxonomy.name,
          description: taxonomy.description,
          isHierarchical: taxonomy.isHierarchical,
          updatedAt: taxonomy.updatedAt,
        },
      });

    return taxonomy;
  }

  async updateTaxonomy(id: string, updates: Partial<Taxonomy>): Promise<Taxonomy> {
    const setObj: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.isHierarchical !== undefined) setObj.isHierarchical = updates.isHierarchical;

    await this.db
      .update(taxonomies)
      .set(setObj)
      .where(eq(taxonomies.id, id));

    const updated = await this.findTaxonomyByIdOrCode(id);
    if (!updated) {
      throw new Error(`Taxonomy ${id} not found after update`);
    }
    return updated;
  }

  async findNodesByTaxonomyId(taxonomyId: string, includeDeleted = false): Promise<TaxonomyNode[]> {
    const conditions = [eq(taxonomyNodes.taxonomyId, taxonomyId)];
    if (!includeDeleted) {
      conditions.push(isNull(taxonomyNodes.deletedAt));
    }

    const rows = await this.db
      .select()
      .from(taxonomyNodes)
      .where(and(...conditions))
      .orderBy(taxonomyNodes.sortOrder, taxonomyNodes.name);

    return rows.map((r) => this.mapNodeToDomain(r));
  }

  async findNodeById(id: string): Promise<TaxonomyNode | null> {
    const rows = await this.db
      .select()
      .from(taxonomyNodes)
      .where(and(eq(taxonomyNodes.id, id), isNull(taxonomyNodes.deletedAt)))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapNodeToDomain(rows[0]);
  }

  async findNodeBySlug(taxonomyId: string, slug: string): Promise<TaxonomyNode | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(taxonomyNodes)
      .where(
        and(
          eq(taxonomyNodes.taxonomyId, taxonomyId),
          eq(taxonomyNodes.slug, normalizedSlug),
          isNull(taxonomyNodes.deletedAt)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapNodeToDomain(rows[0]);
  }

  async saveNode(node: TaxonomyNode): Promise<TaxonomyNode> {
    await this.db
      .insert(taxonomyNodes)
      .values({
        id: node.id,
        taxonomyId: node.taxonomyId,
        parentId: node.parentId,
        name: node.name,
        slug: node.slug,
        description: node.description,
        sortOrder: node.sortOrder,
        status: node.status,
        metadata: node.metadata,
        deletedAt: node.deletedAt,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      })
      .onConflictDoUpdate({
        target: taxonomyNodes.id,
        set: {
          parentId: node.parentId,
          name: node.name,
          slug: node.slug,
          description: node.description,
          sortOrder: node.sortOrder,
          status: node.status,
          metadata: node.metadata,
          deletedAt: node.deletedAt,
          updatedAt: node.updatedAt,
        },
      });

    return node;
  }

  async updateNode(id: string, updates: Partial<TaxonomyNode>): Promise<TaxonomyNode> {
    const setObj: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (updates.parentId !== undefined) setObj.parentId = updates.parentId;
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.slug !== undefined) setObj.slug = updates.slug;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.sortOrder !== undefined) setObj.sortOrder = updates.sortOrder;
    if (updates.status !== undefined) setObj.status = updates.status;
    if (updates.metadata !== undefined) setObj.metadata = updates.metadata;
    if (updates.deletedAt !== undefined) setObj.deletedAt = updates.deletedAt;

    await this.db
      .update(taxonomyNodes)
      .set(setObj)
      .where(eq(taxonomyNodes.id, id));

    const updated = await this.findNodeById(id);
    if (!updated) {
      throw new Error(`Taxonomy node ${id} not found after update`);
    }
    return updated;
  }

  async softDeleteNode(id: string): Promise<void> {
    await this.db
      .update(taxonomyNodes)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taxonomyNodes.id, id));
  }

  /**
   * Truy vấn toàn bộ hậu duệ (descendant IDs) sử dụng Recursive CTE chuẩn SQL
   */
  async findDescendantIds(rootNodeId: string): Promise<string[]> {
    const query = sql`
      WITH RECURSIVE node_tree AS (
        SELECT id FROM taxonomy_nodes
        WHERE id = ${rootNodeId} AND deleted_at IS NULL
        UNION ALL
        SELECT child.id
        FROM taxonomy_nodes child
        INNER JOIN node_tree parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      )
      SELECT id FROM node_tree;
    `;

    const rawResult = await this.db.execute(query);
    const rows = Array.isArray(rawResult) ? rawResult : ((rawResult as any)?.rows || []);
    return rows.map((r: any) => String(r.id));
  }

  /**
   * Truy vấn chuỗi đường dẫn từ gốc tới node (Breadcrumbs) bằng Recursive CTE ngược
   */
  async findBreadcrumbs(nodeId: string): Promise<BreadcrumbItemDTO[]> {
    const query = sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, slug, parent_id, 1 as depth
        FROM taxonomy_nodes
        WHERE id = ${nodeId} AND deleted_at IS NULL
        UNION ALL
        SELECT p.id, p.name, p.slug, p.parent_id, a.depth + 1
        FROM taxonomy_nodes p
        INNER JOIN ancestors a ON p.id = a.parent_id
        WHERE p.deleted_at IS NULL
      )
      SELECT id, name, slug FROM ancestors ORDER BY depth DESC;
    `;

    const rawResult = await this.db.execute(query);
    const rows = Array.isArray(rawResult) ? rawResult : ((rawResult as any)?.rows || []);
    return rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
    }));
  }

  /**
   * Kiểm tra xem potentialDescendantId có phải là chính nó hoặc là con cháu của potentialAncestorId không
   */
  async isDescendant(potentialAncestorId: string, potentialDescendantId: string): Promise<boolean> {
    if (potentialAncestorId === potentialDescendantId) {
      return true;
    }
    const descendants = await this.findDescendantIds(potentialAncestorId);
    return descendants.includes(potentialDescendantId);
  }
}
