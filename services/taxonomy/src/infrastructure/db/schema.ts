import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * 1. Bảng taxonomies: Quản lý danh mục các loại phân loại (Chủ đề, Độ khó, Tags...)
 */
export const taxonomies = pgTable(
  'taxonomies',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    isHierarchical: boolean('is_hierarchical').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_taxonomies_code').on(table.code),
  ]
);

export type TaxonomyRow = typeof taxonomies.$inferSelect;
export type NewTaxonomyRow = typeof taxonomies.$inferInsert;

/**
 * 2. Bảng taxonomy_nodes: Quản lý các nút danh mục theo mô hình Adjacency List (parent_id)
 */
export const taxonomyNodes = pgTable(
  'taxonomy_nodes',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    taxonomyId: varchar('taxonomy_id', { length: 64 })
      .notNull()
      .references(() => taxonomies.id, { onDelete: 'cascade' }),
    parentId: varchar('parent_id', { length: 64 }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('PUBLISHED'),
    metadata: jsonb('metadata').notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_nodes_taxonomy').on(table.taxonomyId),
    index('idx_nodes_parent').on(table.parentId),
    index('idx_nodes_sort').on(table.taxonomyId, table.sortOrder),
    uniqueIndex('uq_nodes_active_slug')
      .on(table.taxonomyId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type TaxonomyNodeRow = typeof taxonomyNodes.$inferSelect;
export type NewTaxonomyNodeRow = typeof taxonomyNodes.$inferInsert;

/**
 * Định nghĩa quan hệ ORM (Drizzle Relations)
 */
export const taxonomiesRelations = relations(taxonomies, ({ many }) => ({
  nodes: many(taxonomyNodes),
}));

export const taxonomyNodesRelations = relations(taxonomyNodes, ({ one, many }) => ({
  taxonomy: one(taxonomies, {
    fields: [taxonomyNodes.taxonomyId],
    references: [taxonomies.id],
  }),
  parent: one(taxonomyNodes, {
    fields: [taxonomyNodes.parentId],
    references: [taxonomyNodes.id],
    relationName: 'nodeHierarchy',
  }),
  children: many(taxonomyNodes, {
    relationName: 'nodeHierarchy',
  }),
}));
