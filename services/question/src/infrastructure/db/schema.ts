import { pgTable, varchar, text, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { QuestionOption, MatchingPair, MediaAsset } from '@platform/contracts';

export const questions = pgTable(
  'questions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // q_xxxx
    code: varchar('code', { length: 64 }).notNull().unique(), // e.g. MATH10-ALG-001
    type: varchar('type', { length: 32 }).notNull(), // SINGLE, MULTIPLE, FILL_IN, MATCHING, ORDERING, NUMERIC, ESSAY
    topicNodeId: varchar('topic_node_id', { length: 64 }), // Khóa logic tham chiếu sang taxonomy_nodes (TOPIC)
    gradeNodeId: varchar('grade_node_id', { length: 64 }), // Khóa logic tham chiếu sang taxonomy_nodes (GRADE)
    difficulty: varchar('difficulty', { length: 32 }).notNull().default('REMEMBER'), // REMEMBER, UNDERSTAND, APPLY, ANALYZE
    defaultPoints: integer('default_points').notNull().default(1),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'), // DRAFT, ACTIVE, DEPRECATED
    currentRevisionId: varchar('current_revision_id', { length: 64 }),
    ownerId: varchar('owner_id', { length: 64 }).notNull(), // Giảng viên sở hữu
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_questions_topic').on(table.topicNodeId),
    index('idx_questions_grade').on(table.gradeNodeId),
    index('idx_questions_difficulty').on(table.difficulty),
    index('idx_questions_status').on(table.status),
    index('idx_questions_owner').on(table.ownerId),
  ]
);

export const questionRevisions = pgTable(
  'question_revisions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // qrev_xxxx
    questionId: varchar('question_id', { length: 64 })
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    prompt: text('prompt').notNull(), // Markdown + KaTeX ($$...$$)
    options: jsonb('options').$type<QuestionOption[]>().notNull(),
    pairs: jsonb('pairs').$type<MatchingPair[]>(),
    explanation: text('explanation'),
    rubric: jsonb('rubric').$type<Record<string, unknown>>(),
    mediaAssets: jsonb('media_assets').$type<MediaAsset[]>(),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_question_revision').on(table.questionId, table.revisionNumber),
    index('idx_qrev_question').on(table.questionId),
  ]
);

export type QuestionRow = typeof questions.$inferSelect;
export type NewQuestionRow = typeof questions.$inferInsert;
export type QuestionRevisionRow = typeof questionRevisions.$inferSelect;
export type NewQuestionRevisionRow = typeof questionRevisions.$inferInsert;
