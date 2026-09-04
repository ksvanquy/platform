import { Quiz } from '../authoring/quiz.entity.js';
import { QuizVersion } from '../authoring/quiz-version.entity.js';
import { Attempt } from '../delivery/attempt.aggregate.js';

export interface AuthoringRepositoryPort {
  saveQuiz(quiz: Quiz): Promise<void>;
  findQuizById(id: string): Promise<Quiz | null>;
  findQuizByCode(code: string): Promise<Quiz | null>;
  listPublishedQuizzes(): Promise<Quiz[]>;

  saveVersion(version: QuizVersion): Promise<void>;
  findVersionById(id: string): Promise<QuizVersion | null>;
  findLatestVersionByQuizId(quizId: string): Promise<QuizVersion | null>;
  listVersionsByQuizId(quizId: string): Promise<QuizVersion[]>;
}

export interface DeliveryRepositoryPort {
  saveAttempt(attempt: Attempt): Promise<void>;
  findAttemptById(id: string): Promise<Attempt | null>;
  listAttemptsByUser(userId: string, quizId?: string): Promise<Attempt[]>;
  findExpiredInProgressAttempts(now?: Date, gracePeriodMs?: number): Promise<Attempt[]>;
}
