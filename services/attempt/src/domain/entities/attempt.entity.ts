import type {
  AttemptDTO,
  AttemptStatus,
  CandidateAnswerRecord,
  AttemptScoreResult,
  SanitizedExamManifest,
} from '@platform/contracts';
import {
  AttemptAlreadySubmittedError,
  AttemptTimeExpiredError,
  OutdatedAnswerSequenceError,
  InvalidAttemptStateTransitionError,
} from '../errors/attempt-domain.errors.js';

export interface AttemptProps {
  id: string;
  userId: string;
  examId: string;
  snapshotId: string;
  variantCode?: string;
  status?: AttemptStatus;
  startedAt?: Date | null;
  deadline?: Date | null;
  submittedAt?: Date | null;
  durationMinutes: number;
  answers?: Record<string, CandidateAnswerRecord>;
  scoreResult?: AttemptScoreResult | null;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Attempt {
  readonly id: string;
  readonly userId: string;
  readonly examId: string;
  readonly snapshotId: string;
  readonly variantCode: string;
  private _status: AttemptStatus;
  private _startedAt: Date | null;
  private _deadline: Date | null;
  private _submittedAt: Date | null;
  readonly durationMinutes: number;
  private _answers: Map<string, CandidateAnswerRecord>;
  private _scoreResult: AttemptScoreResult | null;
  private _version: number;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: AttemptProps) {
    if (!props.id) throw new Error('Attempt ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (!props.examId) throw new Error('Exam ID is required');
    if (!props.snapshotId) throw new Error('Snapshot ID is required');
    if (props.durationMinutes <= 0) throw new Error('Duration minutes must be positive');

    this.id = props.id;
    this.userId = props.userId;
    this.examId = props.examId;
    this.snapshotId = props.snapshotId;
    this.variantCode = props.variantCode || 'DEFAULT';
    this._status = props.status ?? 'CREATED';
    this._startedAt = props.startedAt ?? null;
    this._deadline = props.deadline ?? null;
    this._submittedAt = props.submittedAt ?? null;
    this.durationMinutes = props.durationMinutes;
    this._scoreResult = props.scoreResult ? { ...props.scoreResult } : null;
    this._version = typeof props.version === 'number' && props.version >= 1 ? props.version : 1;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();

    this._answers = new Map();
    if (props.answers) {
      for (const [qId, rec] of Object.entries(props.answers)) {
        this._answers.set(qId, {
          answer: rec.answer,
          answeredAt: rec.answeredAt,
          sequenceNumber: rec.sequenceNumber ?? 1,
          clientTimestamp: rec.clientTimestamp,
        });
      }
    }
  }

  get status(): AttemptStatus {
    return this._status;
  }

  get startedAt(): Date | null {
    return this._startedAt;
  }

  get deadline(): Date | null {
    return this._deadline;
  }

  get submittedAt(): Date | null {
    return this._submittedAt;
  }

  get scoreResult(): AttemptScoreResult | null {
    return this._scoreResult;
  }

  get version(): number {
    return this._version;
  }

  incrementVersion(): void {
    this._version += 1;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get answers(): Readonly<Record<string, CandidateAnswerRecord>> {
    const result: Record<string, CandidateAnswerRecord> = {};
    for (const [qId, rec] of this._answers.entries()) {
      result[qId] = { ...rec };
    }
    return Object.freeze(result);
  }

  /**
   * Tier 1: Kiểm tra xem đã hết thời gian làm bài chính thức chưa (Official Deadline)
   */
  isAnswerTimeExpired(now: Date = new Date()): boolean {
    if (
      this._status === 'SUBMITTED' ||
      this._status === 'EXPIRED' ||
      (this._status as any) === 'GRADED' ||
      (this._status as any) === 'TIMED_OUT_GRADED'
    ) {
      return true;
    }
    if (!this._deadline) return false;
    return now.getTime() > this._deadline.getTime();
  }

  /**
   * Tier 2: Kiểm tra xem đã hết thời gian ân hạn nộp bài chưa (Submission Deadline)
   */
  isSubmissionTimeExpired(now: Date = new Date(), gracePeriodMs = 60000): boolean {
    if ((this._status as any) === 'TIMED_OUT_GRADED' || this._status === 'EXPIRED') {
      return true;
    }
    if (!this._deadline) return false;
    return now.getTime() > this._deadline.getTime() + gracePeriodMs;
  }

  remainingTimeMs(now: Date = new Date()): number {
    if (!this._deadline || this._status !== 'IN_PROGRESS') return 0;
    return Math.max(0, this._deadline.getTime() - now.getTime());
  }

  /**
   * Bắt đầu ca thi (Transition: CREATED -> IN_PROGRESS)
   */
  start(now: Date = new Date(), customDeadline?: Date): void {
    if (this._status !== 'CREATED' && this._status !== 'NOT_STARTED') {
      if (this._status === 'IN_PROGRESS') {
        return; // Idempotent: ca thi đã bắt đầu
      }
      throw new InvalidAttemptStateTransitionError(this._status, 'IN_PROGRESS');
    }

    this._startedAt = now;
    if (customDeadline) {
      this._deadline = customDeadline;
    } else {
      this._deadline = new Date(now.getTime() + this.durationMinutes * 60 * 1000);
    }
    this._status = 'IN_PROGRESS';
    this._updatedAt = now;
  }

  /**
   * Ghi nhận câu trả lời (Idempotent + Sequence Protection <25ms SLA)
   */
  recordAnswer(
    questionId: string,
    answerPayload: unknown,
    sequenceNumber: number,
    clientTimestamp?: number,
    now: Date = new Date(),
    gracePeriodMs = 60000,
    validQuestionIds?: string[]
  ): void {
    if (
      this._status === 'SUBMITTED' ||
      this._status === 'EXPIRED' ||
      (this._status as any) === 'GRADED' ||
      (this._status as any) === 'TIMED_OUT_GRADED'
    ) {
      throw new AttemptAlreadySubmittedError(this.id);
    }

    if (this._status !== 'IN_PROGRESS') {
      throw new InvalidAttemptStateTransitionError(this._status, 'IN_PROGRESS');
    }

    // Tier 1 Check: Zero tolerance for answering after official deadline
    if (this.isAnswerTimeExpired(now)) {
      if (this.isSubmissionTimeExpired(now, gracePeriodMs)) {
        this._status = 'TIMED_OUT_GRADED' as AttemptStatus;
        this._submittedAt = now;
      }
      throw new AttemptTimeExpiredError(this.id);
    }

    // Invariant: câu hỏi phải thuộc bài thi nếu có danh sách câu hỏi
    if (validQuestionIds && !validQuestionIds.includes(questionId)) {
      throw new Error(`Question "${questionId}" does not belong to this exam`);
    }

    // Concurrency defense: Logical sequence check
    const existing = this._answers.get(questionId);
    if (existing && existing.sequenceNumber >= sequenceNumber) {
      throw new OutdatedAnswerSequenceError(questionId, sequenceNumber, existing.sequenceNumber);
    }

    this._answers.set(questionId, {
      answer: answerPayload,
      answeredAt: now.toISOString(),
      sequenceNumber,
      clientTimestamp,
    });
    this._updatedAt = now;
  }

  /**
   * Cập nhật toàn bộ bảng câu trả lời khi nộp bài (Single Submission Model)
   */
  updateAnswers(rawAnswers: Record<string, unknown>, now: Date = new Date()): void {
    if (this.isFinalized()) {
      return;
    }
    for (const [qId, ans] of Object.entries(rawAnswers)) {
      if (ans !== undefined) {
        if (ans && typeof ans === 'object' && 'answer' in ans && (ans as any).answeredAt) {
          const rec = ans as CandidateAnswerRecord;
          this._answers.set(qId, {
            answer: rec.answer,
            answeredAt: rec.answeredAt || now.toISOString(),
            sequenceNumber: rec.sequenceNumber ?? 1,
            clientTimestamp: rec.clientTimestamp,
          });
        } else {
          this._answers.set(qId, {
            answer: ans,
            answeredAt: now.toISOString(),
            sequenceNumber: 1,
          });
        }
      }
    }
    this._updatedAt = now;
  }

  /**
   * Kiểm tra ca thi đã kết thúc / nộp / hoàn tất chưa (Finalized state)
   */
  isFinalized(): boolean {
    return (
      this._status === 'SUBMITTED' ||
      this._status === 'EXPIRED' ||
      (this._status as any) === 'GRADED' ||
      (this._status as any) === 'TIMED_OUT_GRADED'
    );
  }

  /**
   * Nộp bài thi
   */
  submit(now: Date = new Date(), gracePeriodMs = 60000): void {
    if (this.isFinalized()) {
      return; // Idempotent
    }

    if (this._status !== 'IN_PROGRESS') {
      throw new InvalidAttemptStateTransitionError(this._status, 'SUBMITTED');
    }

    this._submittedAt = now;
    if (this.isSubmissionTimeExpired(now, gracePeriodMs)) {
      this._status = 'TIMED_OUT_GRADED' as AttemptStatus;
    } else {
      this._status = 'SUBMITTED';
    }
    this._updatedAt = now;
  }

  /**
   * Đóng băng kết quả chấm thi
   */
  grade(result: AttemptScoreResult): void {
    if (this._status === 'SUBMITTED') {
      this._status = 'GRADED' as AttemptStatus;
      this._scoreResult = Object.freeze({ ...result });
      this._updatedAt = new Date();
      return;
    }

    if ((this._status as any) === 'TIMED_OUT_GRADED') {
      this._scoreResult = Object.freeze({ ...result });
      this._updatedAt = new Date();
      return;
    }

    throw new InvalidAttemptStateTransitionError(this._status, 'GRADED');
  }

  static fromPrimitives(raw: {
    id: string;
    userId: string;
    examId: string;
    snapshotId: string;
    variantCode?: string;
    status?: string;
    startedAt?: string | Date | null;
    deadline?: string | Date | null;
    submittedAt?: string | Date | null;
    durationMinutes: number;
    answers?: Record<string, CandidateAnswerRecord>;
    scoreResult?: AttemptScoreResult | null;
    version?: number;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  }): Attempt {
    return new Attempt({
      id: raw.id,
      userId: raw.userId,
      examId: raw.examId,
      snapshotId: raw.snapshotId,
      variantCode: raw.variantCode,
      status: (raw.status as AttemptStatus) ?? 'CREATED',
      startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
      deadline: raw.deadline ? new Date(raw.deadline) : null,
      submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : null,
      durationMinutes: raw.durationMinutes,
      answers: raw.answers,
      scoreResult: raw.scoreResult,
      version: raw.version ?? 1,
      createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    });
  }

  toPrimitives() {
    return {
      id: this.id,
      userId: this.userId,
      examId: this.examId,
      snapshotId: this.snapshotId,
      variantCode: this.variantCode,
      status: this._status,
      startedAt: this._startedAt,
      deadline: this._deadline,
      submittedAt: this._submittedAt,
      durationMinutes: this.durationMinutes,
      answers: this.answers,
      scoreResult: this._scoreResult,
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  toDTO(manifest?: SanitizedExamManifest): AttemptDTO {
    return {
      id: this.id,
      userId: this.userId,
      examId: this.examId,
      snapshotId: this.snapshotId,
      variantCode: this.variantCode,
      status: this._status,
      startedAt: this._startedAt ? this._startedAt.toISOString() : null,
      deadline: this._deadline ? this._deadline.toISOString() : null,
      submittedAt: this._submittedAt ? this._submittedAt.toISOString() : null,
      durationMinutes: this.durationMinutes,
      manifest,
      answers: this.answers,
      scoreResult: this._scoreResult,
      version: this._version,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
