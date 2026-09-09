import type { Question, QuestionRevision } from '../entities/question.entity.js';
import type { QuestionFilterQuery } from '@platform/contracts';

export interface QuestionRepositoryPort {
  save(question: Question, revision?: QuestionRevision): Promise<Question>;
  findById(id: string): Promise<Question | null>;
  findByCode(code: string): Promise<Question | null>;
  findRevision(questionId: string, revisionNumber: number): Promise<QuestionRevision | null>;
  listRevisions(questionId: string): Promise<QuestionRevision[]>;
  listQuestions(query?: QuestionFilterQuery): Promise<{ questions: Question[]; total: number }>;
  delete(id: string): Promise<boolean>;
}
