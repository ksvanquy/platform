import { SanitizedExamManifest } from '../exam/exam.js';

export type AttemptStatus =
  | 'CREATED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'SUBMITTED'
  | 'EXPIRED';

export interface CandidateAnswerRecord {
  answer: unknown;
  answeredAt: string;
  sequenceNumber: number;
  clientTimestamp?: number;
}

export interface QuestionScoreBreakdown {
  questionId: string;
  isCorrect: boolean;
  scoreAwarded: number;
  maxScore: number;
  candidateAnswer: unknown;
  correctAnswer?: unknown;
  explanation?: string;
  feedback?: string;
}

export interface AttemptScoreResult {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  evaluatedAt: string;
  breakdown: Record<string, QuestionScoreBreakdown>;
}

export type AntiCheatEventType =
  | 'TAB_SWITCH'
  | 'BLUR'
  | 'FULLSCREEN_EXIT'
  | 'PASTE_DETECTED'
  | 'DEVTOOLS_OPEN'
  | 'SPEED_VIOLATION';

export interface AntiCheatEventDTO {
  id: string;
  attemptId: string;
  userId: string;
  eventType: AntiCheatEventType;
  clientTimestamp: string;
  serverTimestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RecordAntiCheatEventInput {
  eventType: AntiCheatEventType;
  clientTimestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StartAttemptInput {
  examId: string;
  variantCode?: string;
}

export interface AutosaveAnswerInput {
  questionId: string;
  answer: unknown;
  sequenceNumber: number;
  clientTimestamp?: number;
}

export interface SubmitAttemptInput {
  reason?: 'MANUAL' | 'TIME_EXPIRED' | 'VIOLATION';
}

export interface AttemptDTO {
  id: string;
  userId: string;
  examId: string;
  snapshotId: string;
  variantCode: string;
  status: AttemptStatus;
  startedAt?: string | null;
  deadline?: string | null;
  submittedAt?: string | null;
  durationMinutes: number;
  manifest?: SanitizedExamManifest;
  answers: Record<string, CandidateAnswerRecord>;
  scoreResult?: AttemptScoreResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSyncResponse {
  clientReceiveTime?: number;
  serverTime: number;
  serverReceiveTime?: number;
  deadline?: number | null;
}
