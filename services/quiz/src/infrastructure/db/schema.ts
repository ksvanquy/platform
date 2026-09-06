import {
  pgTable,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type {
  AuthoringQuestion,
  ScoringPolicyConfig,
  RandomizationPolicy,
} from '../../domain/authoring/quiz-version.entity.js';
import type { AttemptManifest } from '../../domain/delivery/attempt-manifest.js';
import type {
  CandidateAnswerRecord,
  AttemptScoreResult,
} from '../../domain/delivery/attempt.aggregate.js';

/**
 * Bảng quizzes: Quản lý vòng đời và danh tính đề thi
 */
export const quizzes = pgTable(
  'quizzes',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    ownerId: varchar('owner_id', { length: 64 }).notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    currentPublishedVersionId: varchar('current_published_version_id', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quizzes_code').on(table.code),
    index('idx_quizzes_owner').on(table.ownerId),
    index('idx_quizzes_status').on(table.status),
  ]
);

export type QuizRow = typeof quizzes.$inferSelect;
export type NewQuizRow = typeof quizzes.$inferInsert;

/**
 * Bảng quiz_versions: Snapshot nội dung câu hỏi bất biến
 */
export const quizVersions = pgTable(
  'quiz_versions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    quizId: varchar('quiz_id', { length: 64 })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    passingScore: numeric('passing_score', { precision: 6, scale: 2 }).notNull(),
    maxAttempts: integer('max_attempts').notNull().default(1),
    questions: jsonb('questions').$type<readonly AuthoringQuestion[]>().notNull().default([]),
    scoringPolicy: jsonb('scoring_policy').$type<ScoringPolicyConfig>().notNull(),
    randomizationPolicy: jsonb('randomization_policy').$type<RandomizationPolicy>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_quiz_version').on(table.quizId, table.versionNumber),
    index('idx_quiz_versions_quiz_id').on(table.quizId),
  ]
);

export type QuizVersionRow = typeof quizVersions.$inferSelect;
export type NewQuizVersionRow = typeof quizVersions.$inferInsert;

/**
 * Bảng attempts: Quản lý phiên làm bài, câu trả lời và bảng điểm chi tiết
 */
export const attempts = pgTable(
  'attempts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    quizId: varchar('quiz_id', { length: 64 })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'restrict' }),
    quizVersionId: varchar('quiz_version_id', { length: 64 })
      .notNull()
      .references(() => quizVersions.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 32 }).notNull().default('CREATED'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    deadline: timestamp('deadline', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    manifest: jsonb('manifest').$type<AttemptManifest>(),
    answers: jsonb('answers').$type<Record<string, CandidateAnswerRecord>>().notNull().default({}),
    scoreResult: jsonb('score_result').$type<AttemptScoreResult>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_attempts_user').on(table.userId),
    index('idx_attempts_user_quiz').on(table.userId, table.quizId),
    index('idx_attempts_sweeper').on(table.status, table.deadline),
  ]
);

export type AttemptRow = typeof attempts.$inferSelect;
export type NewAttemptRow = typeof attempts.$inferInsert;

// Quan hệ Drizzle Relations
export const quizzesRelations = relations(quizzes, ({ many }) => ({
  versions: many(quizVersions),
  attempts: many(attempts),
}));

export const quizVersionsRelations = relations(quizVersions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [quizVersions.quizId],
    references: [quizzes.id],
  }),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [attempts.quizId],
    references: [quizzes.id],
  }),
  version: one(quizVersions, {
    fields: [attempts.quizVersionId],
    references: [quizVersions.id],
  }),
}));
