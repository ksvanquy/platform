import { pgTable, varchar, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type {
  CandidateAnswerRecord,
  AttemptScoreResult,
} from '@platform/contracts';

export const attempts = pgTable('attempts', {
  id: varchar('id', { length: 64 }).primaryKey(), // att_xxxx
  userId: varchar('user_id', { length: 64 }).notNull(),
  examId: varchar('exam_id', { length: 64 }).notNull(), // Logical reference to exam_db
  snapshotId: varchar('snapshot_id', { length: 64 }).notNull(), // Logical reference to immutable exam_snapshot
  variantCode: varchar('variant_code', { length: 32 }).notNull().default('DEFAULT'),
  status: varchar('status', { length: 32 }).notNull().default('CREATED'), // CREATED, IN_PROGRESS, PAUSED, SUBMITTED, EXPIRED, GRADED, TIMED_OUT_GRADED
  version: integer('version').notNull().default(1),
  startedAt: timestamp('started_at', { withTimezone: true }),
  deadline: timestamp('deadline', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull(),
  answers: jsonb('answers').$type<Record<string, CandidateAnswerRecord>>().notNull().default({}),
  scoreResult: jsonb('score_result').$type<AttemptScoreResult>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_attempts_user_exam').on(table.userId, table.examId),
  index('idx_attempts_status_deadline').on(table.status, table.deadline),
  index('idx_attempts_exam').on(table.examId),
  index('idx_attempts_id_version_status').on(table.id, table.version, table.status),
]);
