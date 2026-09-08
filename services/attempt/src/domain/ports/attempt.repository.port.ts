import type {
  ExamDTO,
  ExamSnapshotDTO,
  SanitizedExamManifest,
  AttemptStatus,
} from '@platform/contracts';
import { Attempt } from '../entities/attempt.entity.js';
import { AttemptEvent } from '../entities/attempt-event.entity.js';

export interface AttemptFilterQuery {
  userId?: string;
  examId?: string;
  status?: AttemptStatus;
  limit?: number;
  offset?: number;
}

export interface AttemptRepositoryPort {
  saveAttempt(attempt: Attempt): Promise<Attempt>;
  findAttemptById(id: string): Promise<Attempt | null>;
  findActiveAttempt(userId: string, examId: string): Promise<Attempt | null>;
  listAttemptsByUser(userId: string, examId?: string): Promise<Attempt[]>;
  listAttempts(filter?: AttemptFilterQuery): Promise<{ attempts: Attempt[]; total: number }>;
  findExpiredInProgressAttempts(now: Date, gracePeriodMs: number): Promise<Attempt[]>;
  saveEvent(event: AttemptEvent): Promise<AttemptEvent>;
  listEventsByAttemptId(attemptId: string): Promise<AttemptEvent[]>;
}

export interface ExamClientPort {
  getExam(examIdOrCode: string): Promise<ExamDTO | null>;
  getExamSnapshot(examId: string, variantCode?: string): Promise<ExamSnapshotDTO | null>;
  getSanitizedManifest(examId: string, variantCode?: string): Promise<SanitizedExamManifest | null>;
}
