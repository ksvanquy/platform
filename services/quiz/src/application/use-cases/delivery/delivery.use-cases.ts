import { Attempt, AttemptScoreResult } from '../../../domain/delivery/attempt.aggregate.js';
import { AttemptManifestFactory, AttemptManifest } from '../../../domain/delivery/attempt-manifest.js';
import { DeliverySanitizer, DeliveryQuestion } from '../../../domain/delivery/delivery-sanitizer.js';
import { AttemptPolicy } from '../../../domain/authoring/attempt.policy.js';
import { AuthoringRepositoryPort, DeliveryRepositoryPort } from '../../../domain/ports/assessment.repository.ports.js';
import { AssessmentScoringEngine } from '../../../domain/scoring/assessment-scoring.engine.js';
import { QuestionRegistry } from '../../../domain/question-engine/question.registry.js';
import {
  QuizNotFoundError,
  QuizNotPublishedError,
  AttemptNotFoundError,
  ForbiddenError,
} from '../../../domain/errors/domain-errors.js';

export interface CreateAttemptInput {
  userId: string;
  quizId: string;
}

export interface StartAttemptInput {
  attemptId: string;
  userId: string;
}

export interface RecordAnswerInput {
  attemptId: string;
  userId: string;
  questionId: string;
  answer: unknown;
  sequenceNumber?: number;
  clientTimestamp?: number;
  now?: Date;
  gracePeriodMs?: number;
}

export interface SubmitAttemptInput {
  attemptId: string;
  userId: string;
}

export class DeliveryUseCases {
  constructor(
    private authoringRepo: AuthoringRepositoryPort,
    private deliveryRepo: DeliveryRepositoryPort
  ) {}

  /**
   * Tạo lượt thi mới hoặc tái sử dụng lượt thi đang dở dang (Idempotency + Multi-tab defense)
   */
  async createAttempt(input: CreateAttemptInput): Promise<{ attempt: Attempt; isExisting: boolean }> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }
    if (quiz.status !== 'PUBLISHED' || !quiz.currentPublishedVersionId) {
      throw new QuizNotPublishedError(input.quizId);
    }

    const version = await this.authoringRepo.findVersionById(quiz.currentPublishedVersionId);
    if (!version) {
      throw new Error(`Published version "${quiz.currentPublishedVersionId}" not found`);
    }

    // Kiểm tra lịch sử thi của thí sinh
    const existingAttempts = await this.deliveryRepo.listAttemptsByUser(input.userId, input.quizId);

    // Nếu đã có attempt dở dang (CREATED hoặc IN_PROGRESS), trả về attempt đó thay vì tạo trùng lặp
    const active = existingAttempts.find(
      (a) => a.status === 'CREATED' || a.status === 'IN_PROGRESS'
    );
    if (active) {
      return { attempt: active, isExisting: true };
    }

    // Kiểm tra AttemptPolicy (maxAttempts)
    AttemptPolicy.validateCanStart(
      input.userId,
      input.quizId,
      version.maxAttempts,
      existingAttempts.map((a) => ({
        id: a.id,
        userId: a.userId,
        quizId: a.quizId,
        status: a.status,
      }))
    );

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const attempt = new Attempt({
      id: attemptId,
      userId: input.userId,
      quizId: input.quizId,
      quizVersionId: version.id,
      status: 'CREATED',
    });

    await this.deliveryRepo.saveAttempt(attempt);
    return { attempt, isExisting: false };
  }

  /**
   * Bắt đầu tính giờ thi và phát đề thi đã khử khuẩn cho thí sinh
   */
  async startAttempt(input: StartAttemptInput): Promise<{
    attempt: Attempt;
    manifest: AttemptManifest;
    questions: readonly DeliveryQuestion[];
  }> {
    const attempt = await this.deliveryRepo.findAttemptById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }
    if (attempt.userId !== input.userId) {
      throw new ForbiddenError('Access denied: You do not own this attempt');
    }

    const version = await this.authoringRepo.findVersionById(attempt.quizVersionId);
    if (!version) {
      throw new Error(`QuizVersion "${attempt.quizVersionId}" not found`);
    }

    let manifest = attempt.manifest;
    if (attempt.status === 'CREATED' || !manifest) {
      manifest = AttemptManifestFactory.create(version, new Date());
      attempt.start(new Date(manifest.startedAt), manifest);
      await this.deliveryRepo.saveAttempt(attempt);
    }

    const questions = DeliverySanitizer.sanitizeQuestions(version.questions, manifest);
    return { attempt, manifest, questions };
  }

  /**
   * Ghi nhận câu trả lời từng câu (Idempotent + Sequence-Based Concurrency Defense)
   */
  async recordAnswer(input: RecordAnswerInput): Promise<void> {
    const attempt = await this.deliveryRepo.findAttemptById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }
    if (attempt.userId !== input.userId) {
      throw new ForbiddenError('Access denied: You do not own this attempt');
    }

    const sequenceNumber = input.sequenceNumber ?? input.clientTimestamp ?? Date.now();
    const now = input.now || new Date();
    const gracePeriodMs = input.gracePeriodMs ?? 15000;

    attempt.recordAnswer(input.questionId, input.answer, sequenceNumber, now, gracePeriodMs);

    await this.deliveryRepo.saveAttempt(attempt);
  }

  /**
   * Nộp bài thi và kích hoạt chấm điểm chính thức (Auto-Submit on Timeout)
   */
  async submitAttempt(input: SubmitAttemptInput): Promise<{
    attempt: Attempt;
    scoreResult: AttemptScoreResult;
  }> {
    const attempt = await this.deliveryRepo.findAttemptById(input.attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(input.attemptId);
    }
    if (attempt.userId !== input.userId) {
      throw new ForbiddenError('Access denied: You do not own this attempt');
    }

    const version = await this.authoringRepo.findVersionById(attempt.quizVersionId);
    if (!version) {
      throw new Error(`QuizVersion "${attempt.quizVersionId}" not found`);
    }

    // Thực hiện nộp bài (tự chuyển sang TIMED_OUT_GRADED nếu quá hạn)
    attempt.submit(new Date());

    // Chấm điểm độc lập bằng AssessmentScoringEngine
    const scoreResult = AssessmentScoringEngine.evaluate({
      questions: version.questions,
      answers: attempt.answers,
      scoringPolicy: version.scoringPolicy,
      passingScore: version.passingScore,
    });

    attempt.grade(scoreResult);
    await this.deliveryRepo.saveAttempt(attempt);

    return { attempt, scoreResult };
  }

  async getAttemptDetails(
    attemptId: string,
    userId: string,
    now: Date = new Date(),
    gracePeriodMs = 15000
  ): Promise<{
    attempt: Attempt;
    questions?: readonly DeliveryQuestion[];
    autoSwept?: boolean;
  }> {
    const attempt = await this.deliveryRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }
    if (attempt.userId !== userId) {
      throw new ForbiddenError('Access denied: You do not own this attempt');
    }

    let autoSwept = false;
    // Opportunistic Sweeper: Nếu thí sinh tải lại trang khi đã quá hạn làm bài và nộp bài
    if (attempt.status === 'IN_PROGRESS' && attempt.isSubmissionTimeExpired(now, gracePeriodMs)) {
      attempt.submit(now, gracePeriodMs);
      const version = await this.authoringRepo.findVersionById(attempt.quizVersionId);
      if (version) {
        const scoreResult = AssessmentScoringEngine.evaluate({
          questions: version.questions,
          answers: attempt.answers,
          scoringPolicy: version.scoringPolicy,
          passingScore: version.passingScore,
        });
        attempt.grade(scoreResult);
        await this.deliveryRepo.saveAttempt(attempt);
        autoSwept = true;
      }
    }

    let questions: readonly DeliveryQuestion[] | undefined;
    if (attempt.manifest) {
      const version = await this.authoringRepo.findVersionById(attempt.quizVersionId);
      if (version) {
        questions = DeliverySanitizer.sanitizeQuestions(version.questions, attempt.manifest);
      }
    }

    return { attempt, questions, autoSwept };
  }
}
