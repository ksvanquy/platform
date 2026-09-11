import type {
  ExamDTO,
  ExamSnapshotDTO,
  SanitizedExamManifest,
  AttemptStatus,
  CandidateAnswerRecord,
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

export interface PatchAnswerAtomicResult {
  success: boolean;
  newVersion: number;
  remainingTimeMs: number;
  status: AttemptStatus;
}

export interface AttemptRepositoryPort {
  saveAttempt(attempt: Attempt): Promise<Attempt>;
  findAttemptById(id: string): Promise<Attempt | null>;
  findActiveAttempt(userId: string, examId: string): Promise<Attempt | null>;
  listAttemptsByUser(userId: string, examId?: string): Promise<Attempt[]>;
  listAttempts(filter?: AttemptFilterQuery): Promise<{ attempts: Attempt[]; total: number }>;
  findExpiredInProgressAttempts(now: Date, gracePeriodMs: number, limit?: number): Promise<Attempt[]>;
  saveEvent(event: AttemptEvent): Promise<AttemptEvent>;
  listEventsByAttemptId(attemptId: string): Promise<AttemptEvent[]>;
  patchAnswerAtomic(
    attemptId: string,
    questionId: string,
    answerRecord: CandidateAnswerRecord,
    expectedVersion?: number,
    userId?: string,
    userRole?: string
  ): Promise<PatchAnswerAtomicResult>;
  withAttemptLock<T>(
    attemptId: string,
    operation: (attempt: Attempt, saveLocked: (updated: Attempt) => Promise<void>) => Promise<T>
  ): Promise<T>;
  withAdvisoryLock<T>(
    lockKey: number,
    operation: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T }>;
}

export interface ExamClientPort {
  getExam(examIdOrCode: string): Promise<ExamDTO | null>;
  getExamSnapshot(examId: string, variantCode?: string): Promise<ExamSnapshotDTO | null>;
  getSanitizedManifest(examId: string, variantCode?: string): Promise<SanitizedExamManifest | null>;
}
