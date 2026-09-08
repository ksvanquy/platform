import { pgTable, varchar, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { BlueprintCriterion, ScoringPolicyConfig } from '@platform/contracts';

export const assessments = pgTable(
  'assessments',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // asm_xxxx
    code: varchar('code', { length: 64 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    ownerId: varchar('owner_id', { length: 64 }).notNull(),
    primaryTopicNodeId: varchar('primary_topic_node_id', { length: 64 }),
    gradeNodeId: varchar('grade_node_id', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'), // DRAFT, REVIEW, APPROVED, ARCHIVED
    currentBlueprintId: varchar('current_blueprint_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_assessments_topic').on(table.primaryTopicNodeId),
    index('idx_assessments_grade').on(table.gradeNodeId),
    index('idx_assessments_status').on(table.status),
    index('idx_assessments_owner').on(table.ownerId),
  ]
);

export const blueprints = pgTable(
  'blueprints',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // bp_xxxx
    assessmentId: varchar('assessment_id', { length: 64 })
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(45),
    passingPercentage: integer('passing_percentage').notNull().default(50),
    maxAttempts: integer('max_attempts').notNull().default(1),
    criteria: jsonb('criteria').$type<BlueprintCriterion[]>().notNull().default([]),
    scoringPolicy: jsonb('scoring_policy')
      .$type<ScoringPolicyConfig>()
      .notNull()
      .default({ strategyType: 'STANDARD', roundingDecimal: 2 }),
    isLocked: boolean('is_locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_assessment_blueprint').on(table.assessmentId, table.versionNumber),
    index('idx_bp_assessment').on(table.assessmentId),
  ]
);

export type AssessmentRow = typeof assessments.$inferSelect;
export type NewAssessmentRow = typeof assessments.$inferInsert;
export type BlueprintRow = typeof blueprints.$inferSelect;
export type NewBlueprintRow = typeof blueprints.$inferInsert;
