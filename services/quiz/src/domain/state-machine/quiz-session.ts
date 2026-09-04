import { UserAnswers, UserAnswerValue } from '../entities/quiz.js';
import { EvaluationResult } from '../scoring/scoring.factory.js';

export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'SUBMITTED' | 'EXPIRED';

export interface AnswerLog {
  readonly answer: UserAnswerValue;
  readonly answeredAt: Date;
}

export interface QuizSessionProps {
  id: string;
  userId: string;
  quizId: string;
  durationMinutes: number;
  allowedQuestionIds?: readonly string[];
  startedAt?: Date;
  submittedAt?: Date;
  answers?: UserAnswers | Record<string, AnswerLog>;
  status?: SessionStatus;
  result?: EvaluationResult;
}

/**
 * Aggregate Root: QuizSession
 * Quản lý vòng đời phiên thi (Finite State Machine) và bảo vệ các bất biến (Invariants)
 */
export class QuizSession {
  readonly id: string;
  readonly userId: string;
  readonly quizId: string;
  readonly durationMinutes: number;
  private readonly _allowedQuestionIds: Set<string>;

  private _status: SessionStatus;
  private _startedAt: Date;
  private _submittedAt?: Date;
  private _answers: Map<string, AnswerLog>;
  private _result?: EvaluationResult;

  constructor(props: QuizSessionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.quizId = props.quizId;
    this.durationMinutes = props.durationMinutes;
    this._allowedQuestionIds = new Set(props.allowedQuestionIds || []);
    this._status = props.status || 'IN_PROGRESS';
    this._startedAt = props.startedAt || new Date();
    this._submittedAt = props.submittedAt;
    this._result = props.result;

    this._answers = new Map();
    if (props.answers) {
      for (const [qId, val] of Object.entries(props.answers)) {
        if (val && typeof val === 'object' && 'answeredAt' in val && 'answer' in val) {
          const log = val as AnswerLog;
          this._answers.set(qId, { answer: log.answer, answeredAt: new Date(log.answeredAt) });
        } else {
          this._answers.set(qId, { answer: val, answeredAt: this._startedAt });
        }
      }
    }
  }

  get status(): SessionStatus {
    return this._status;
  }

  get startedAt(): Date {
    return new Date(this._startedAt);
  }

  get submittedAt(): Date | undefined {
    return this._submittedAt ? new Date(this._submittedAt) : undefined;
  }

  get result(): EvaluationResult | undefined {
    return this._result;
  }

  get answers(): UserAnswers {
    const raw: UserAnswers = {};
    for (const [qId, log] of this._answers.entries()) {
      raw[qId] = log.answer;
    }
    return raw;
  }

  get answerLogs(): Record<string, AnswerLog> {
    const logs: Record<string, AnswerLog> = {};
    for (const [qId, log] of this._answers.entries()) {
      logs[qId] = { answer: log.answer, answeredAt: new Date(log.answeredAt) };
    }
    return logs;
  }

  get allowedQuestionIds(): string[] {
    return Array.from(this._allowedQuestionIds);
  }

  /**
   * Tính toán thời gian hết giờ dựa trên Server Time
   */
  isExpired(now: Date = new Date()): boolean {
    if (this._status === 'EXPIRED') return true;
    const expireTime = this._startedAt.getTime() + this.durationMinutes * 60 * 1000;
    return now.getTime() > expireTime;
  }

  /**
   * Invariant: Bắt đầu làm bài từ trạng thái NOT_STARTED
   */
  start(now: Date = new Date()): void {
    if (this._status !== 'NOT_STARTED') {
      throw new Error(`Cannot start session in status: ${this._status}`);
    }
    this._status = 'IN_PROGRESS';
    this._startedAt = now;
  }

  /**
   * Tạm dừng phiên thi (nếu bài thi cho phép pause)
   */
  pause(): void {
    if (this._status !== 'IN_PROGRESS') {
      throw new Error(`Cannot pause session in status: ${this._status}`);
    }
    this._status = 'PAUSED';
  }

  /**
   * Tiếp tục phiên thi sau khi tạm dừng
   */
  resume(): void {
    if (this._status !== 'PAUSED') {
      throw new Error(`Cannot resume session in status: ${this._status}`);
    }
    this._status = 'IN_PROGRESS';
  }

  /**
   * Invariant 1: Chặn trả lời khi phiên đã đóng băng hoặc hết giờ
   * Invariant 2: Chặn trả lời câu hỏi lạ không thuộc danh sách câu hỏi của đề thi
   */
  answerQuestion(questionId: string, answer: UserAnswerValue, now: Date = new Date()): void {
    if (this._status === 'SUBMITTED' || this._status === 'EXPIRED') {
      throw new Error(`Cannot update answers. Session is already ${this._status}.`);
    }

    if (this.isExpired(now)) {
      this._status = 'EXPIRED';
      throw new Error('Session has expired.');
    }

    if (this._status !== 'IN_PROGRESS') {
      throw new Error(`Cannot answer question while session is ${this._status}.`);
    }

    if (this._allowedQuestionIds.size > 0 && !this._allowedQuestionIds.has(questionId)) {
      throw new Error(`Question "${questionId}" does not belong to this quiz session.`);
    }

    this._answers.set(questionId, {
      answer,
      answeredAt: now,
    });
  }

  /**
   * Nộp bài, chuyển trạng thái và ĐÓNG BĂNG kết quả chấm thi vào bên trong Session
   * Hỗ trợ tính lũy thừa (Idempotency): nếu đã SUBMITTED thì không nộp lại
   */
  submit(now: Date = new Date(), evaluationResult?: EvaluationResult): void {
    // Idempotent: Nếu đã nộp trước đó thì giữ nguyên trạng thái và kết quả
    if (this._status === 'SUBMITTED') {
      return;
    }

    if (this.isExpired(now)) {
      this._status = 'EXPIRED';
    } else {
      this._status = 'SUBMITTED';
    }

    this._submittedAt = now;
    if (evaluationResult) {
      this._result = Object.freeze({ ...evaluationResult });
    }
  }

  /**
   * Gắn kết quả đánh giá vào phiên thi và đóng băng kết quả
   */
  attachResult(evaluationResult: EvaluationResult): void {
    this._result = Object.freeze({ ...evaluationResult });
  }

  /**
   * Tự động format sang JSON chuẩn cho REST API DTO (tránh lộ private fields _status, _answers)
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      quizId: this.quizId,
      durationMinutes: this.durationMinutes,
      status: this.status,
      startedAt: this.startedAt.toISOString(),
      submittedAt: this.submittedAt ? this.submittedAt.toISOString() : undefined,
      answers: this.answers,
      allowedQuestionIds: this.allowedQuestionIds,
      result: this.result,
    };
  }
}