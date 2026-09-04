import { AttemptStatus, AttemptStateMachine } from './attempt-status.js';
import { AttemptManifest } from './attempt-manifest.js';
import {
  AttemptAlreadySubmittedError,
  AttemptTimeExpiredError,
  OutdatedAnswerTimestampError,
  InvalidAttemptStateTransitionError,
} from '../errors/domain-errors.js';

export interface CandidateAnswerRecord {
  readonly answer: unknown;
  readonly answeredAt: Date;
  readonly clientTimestamp: number;
}

export interface QuestionScoreDetail {
  readonly isCorrect: boolean;
  readonly scoreAwarded: number;
  readonly maxScore: number;
  readonly feedback?: string;
}

export interface AttemptScoreResult {
  readonly score: number;
  readonly maxScore: number;
  readonly percentage: number;
  readonly passed: boolean;
  readonly evaluatedAt: Date;
  readonly breakdown?: Readonly<Record<string, QuestionScoreDetail>>;
}

export interface AttemptProps {
  id: string;
  userId: string;
  quizId: string;
  quizVersionId: string;
  status?: AttemptStatus;
  startedAt?: Date;
  deadline?: Date;
  submittedAt?: Date;
  manifest?: AttemptManifest;
  answers?: Record<string, CandidateAnswerRecord>;
  scoreResult?: AttemptScoreResult;
}

/**
 * Aggregate Root: Attempt
 * Đại diện cho một phiên thực thi (Runtime Execution) của một thí sinh trên một QuizVersion đóng băng.
 * Kiểm soát Finite State Machine, Server-Authoritative Timer, Concurrency Defense và Auto-Submit.
 */
export class Attempt {
  readonly id: string;
  readonly userId: string;
  readonly quizId: string;
  readonly quizVersionId: string;

  private _status: AttemptStatus;
  private _startedAt?: Date;
  private _deadline?: Date;
  private _submittedAt?: Date;
  private _manifest?: AttemptManifest;
  private _answers: Map<string, CandidateAnswerRecord>;
  private _scoreResult?: AttemptScoreResult;

  constructor(props: AttemptProps) {
    if (!props.id || props.id.trim() === '') {
      throw new Error('Attempt ID is required');
    }
    if (!props.userId || props.userId.trim() === '') {
      throw new Error('User ID is required');
    }
    if (!props.quizId || props.quizId.trim() === '') {
      throw new Error('Quiz ID is required');
    }
    if (!props.quizVersionId || props.quizVersionId.trim() === '') {
      throw new Error('Quiz Version ID is required');
    }

    this.id = props.id;
    this.userId = props.userId;
    this.quizId = props.quizId;
    this.quizVersionId = props.quizVersionId;
    this._status = props.status ?? 'CREATED';
    this._startedAt = props.startedAt ? new Date(props.startedAt) : undefined;
    this._deadline = props.deadline ? new Date(props.deadline) : undefined;
    this._submittedAt = props.submittedAt ? new Date(props.submittedAt) : undefined;
    this._manifest = props.manifest;
    this._scoreResult = props.scoreResult ? Object.freeze({ ...props.scoreResult }) : undefined;

    this._answers = new Map();
    if (props.answers) {
      for (const [qId, record] of Object.entries(props.answers)) {
        this._answers.set(qId, {
          answer: record.answer,
          answeredAt: new Date(record.answeredAt),
          clientTimestamp: record.clientTimestamp,
        });
      }
    }
  }

  get status(): AttemptStatus {
    return this._status;
  }

  get startedAt(): Date | undefined {
    return this._startedAt ? new Date(this._startedAt) : undefined;
  }

  get deadline(): Date | undefined {
    return this._deadline ? new Date(this._deadline) : undefined;
  }

  get submittedAt(): Date | undefined {
    return this._submittedAt ? new Date(this._submittedAt) : undefined;
  }

  get manifest(): AttemptManifest | undefined {
    return this._manifest;
  }

  get answers(): Readonly<Record<string, CandidateAnswerRecord>> {
    const map: Record<string, CandidateAnswerRecord> = {};
    for (const [qId, rec] of this._answers.entries()) {
      map[qId] = { ...rec, answeredAt: new Date(rec.answeredAt) };
    }
    return Object.freeze(map);
  }

  get scoreResult(): AttemptScoreResult | undefined {
    return this._scoreResult;
  }

  /**
   * Kiểm tra đã quá hạn nộp bài chưa (Server-Authoritative)
   */
  isExpired(now: Date = new Date(), gracePeriodMs = 15000): boolean {
    if (this._status === 'TIMED_OUT_GRADED') return true;
    if (!this._deadline) return false;
    return now.getTime() > this._deadline.getTime() + gracePeriodMs;
  }

  /**
   * Thời gian làm bài còn lại (ms)
   */
  remainingTimeMs(now: Date = new Date()): number {
    if (!this._deadline || this._status !== 'IN_PROGRESS') return 0;
    return Math.max(0, this._deadline.getTime() - now.getTime());
  }

  /**
   * Transition: Bắt đầu tính giờ thi
   */
  start(now: Date, manifest: AttemptManifest): void {
    if (this._status !== 'CREATED') {
      throw new InvalidAttemptStateTransitionError(this._status, 'IN_PROGRESS');
    }
    if (manifest.quizVersionId !== this.quizVersionId) {
      throw new Error(
        `Manifest version "${manifest.quizVersionId}" does not match Attempt version "${this.quizVersionId}"`
      );
    }

    this._manifest = manifest;
    this._startedAt = now;
    this._deadline = new Date(manifest.deadline);
    this._status = 'IN_PROGRESS';
  }

  /**
   * Ghi nhận câu trả lời từng câu (Idempotent + Concurrency Defense)
   */
  recordAnswer(
    questionId: string,
    answerPayload: unknown,
    clientTimestamp: number,
    now: Date = new Date(),
    gracePeriodMs = 15000
  ): void {
    if (this._status === 'SUBMITTED' || AttemptStateMachine.isTerminal(this._status)) {
      throw new AttemptAlreadySubmittedError(this.id);
    }

    if (this._status !== 'IN_PROGRESS') {
      throw new InvalidAttemptStateTransitionError(this._status, 'IN_PROGRESS');
    }

    // Server-Authoritative Timer Check: nếu hết giờ quá hạn cho phép, chuyển sang auto-submit timeout
    if (this.isExpired(now, gracePeriodMs)) {
      this._status = 'TIMED_OUT_GRADED';
      this._submittedAt = now;
      throw new AttemptTimeExpiredError(this.id);
    }

    // Invariant: Câu hỏi phải nằm trong AttemptManifest đã cấp
    if (this._manifest && !this._manifest.questionIds.includes(questionId)) {
      throw new Error(`Question "${questionId}" does not belong to this attempt manifest`);
    }

    // Concurrency Defense: Chống Out-Of-Order request từ client do mạng lag
    const existing = this._answers.get(questionId);
    if (existing && existing.clientTimestamp > clientTimestamp) {
      throw new OutdatedAnswerTimestampError(questionId, clientTimestamp, existing.clientTimestamp);
    }

    this._answers.set(questionId, {
      answer: answerPayload,
      answeredAt: now,
      clientTimestamp,
    });
  }

  /**
   * Nộp bài thi (Graceful Auto-Submit on Timeout + Idempotency)
   */
  submit(now: Date = new Date(), gracePeriodMs = 15000): void {
    // Idempotent: Nếu đã nộp trước đó thì giữ nguyên trạng thái
    if (this._status === 'SUBMITTED' || AttemptStateMachine.isTerminal(this._status)) {
      return;
    }

    if (this._status !== 'IN_PROGRESS') {
      throw new InvalidAttemptStateTransitionError(this._status, 'SUBMITTED');
    }

    this._submittedAt = now;

    // Graceful Auto-Submit check: Nếu nộp quá deadline + grace period
    if (this.isExpired(now, gracePeriodMs)) {
      this._status = 'TIMED_OUT_GRADED';
    } else {
      this._status = 'SUBMITTED';
    }
  }

  /**
   * Đóng băng kết quả chấm điểm vào lượt thi
   */
  grade(result: AttemptScoreResult): void {
    if (this._status === 'SUBMITTED') {
      this._status = 'GRADED';
      this._scoreResult = Object.freeze({ ...result });
      return;
    }

    if (this._status === 'TIMED_OUT_GRADED') {
      // Giữ nguyên trạng thái TIMED_OUT_GRADED nhưng lưu điểm
      this._scoreResult = Object.freeze({ ...result });
      return;
    }

    throw new InvalidAttemptStateTransitionError(this._status, 'GRADED');
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      quizId: this.quizId,
      quizVersionId: this.quizVersionId,
      status: this._status,
      startedAt: this._startedAt ? this._startedAt.toISOString() : undefined,
      deadline: this._deadline ? this._deadline.toISOString() : undefined,
      submittedAt: this._submittedAt ? this._submittedAt.toISOString() : undefined,
      manifest: this._manifest,
      answers: this.answers,
      scoreResult: this._scoreResult,
    };
  }
}
