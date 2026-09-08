import { pgTable, varchar, integer, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type {
  FrozenQuestionItem,
  SanitizedExamManifest,
  ScoringPolicyConfig,
} from '@platform/contracts';

export const exams = pgTable('exams', {
  id: varchar('id', { length: 64 }).primaryKey(), // exm_xxxx
  assessmentId: varchar('assessment_id', { length: 64 }).notNull(), // Logical reference to assessment_db
  code: varchar('code', { length: 64 }).notNull().unique(), // e.g. HK1-TOAN10-2026
  title: varchar('title', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  randomizationSeedBase: integer('randomization_seed_base').notNull().default(1337),
  status: varchar('status', { length: 32 }).notNull().default('READY'), // READY, ACTIVE, CLOSED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_exams_assessment').on(table.assessmentId),
  index('idx_exams_status').on(table.status),
]);

export const examSnapshots = pgTable('exam_snapshots', {
  id: varchar('id', { length: 64 }).primaryKey(), // snp_xxxx
  examId: varchar('exam_id', { length: 64 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  variantCode: varchar('variant_code', { length: 32 }).notNull(), // "DEFAULT", "101", "102"
  contentHash: varchar('content_hash', { length: 64 }).notNull(), // SHA-256 tamper-proof hash
  frozenPayload: jsonb('frozen_payload').$type<{
    questions: FrozenQuestionItem[];
    scoringPolicy: ScoringPolicyConfig;
  }>().notNull(),
  sanitizedManifest: jsonb('sanitized_manifest').$type<SanitizedExamManifest>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_exam_variant').on(table.examId, table.variantCode),
  index('idx_exam_snapshots_exam').on(table.examId),
]);
