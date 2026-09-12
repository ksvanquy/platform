import crypto from 'node:crypto';
import type {
  AttemptDTO,
  SanitizedExamManifest,
} from '@platform/contracts';
import { Attempt } from '../../domain/entities/attempt.entity.js';
import type {
  AttemptRepositoryPort,
  ExamClientPort,
} from '../../domain/ports/attempt.repository.port.js';
import {
  ExamNotFoundError,
  ExamNotActiveError,
  ExamSnapshotNotFoundError,
} from '../../domain/errors/attempt-domain.errors.js';
import { AttemptScoringEngine } from '../../domain/scoring/attempt-scoring.engine.js';

export interface CreateOrRecoverAttemptInput {
  userId: string;
  examIdOrCode: string;
  variantCode?: string;
  autoStart?: boolean;
}

export interface CreateOrRecoverAttemptOutput {
  attempt: AttemptDTO;
  isRecovered: boolean;
  manifest: SanitizedExamManifest;
  serverTime: string;
  serverTimestamp: number;
}

export class CreateOrRecoverAttemptUseCase {
  constructor(
    private readonly attemptRepo: AttemptRepositoryPort,
    private readonly examClient: ExamClientPort
  ) {}

  async execute(input: CreateOrRecoverAttemptInput): Promise<CreateOrRecoverAttemptOutput> {
    const now = new Date();
    const { userId, examIdOrCode, variantCode = 'DEFAULT', autoStart = false } = input;

    // 1. Kiểm tra Exam từ Exam Service
    const exam = await this.examClient.getExam(examIdOrCode);
    if (!exam) {
      throw new ExamNotFoundError(examIdOrCode);
    }

    if (!exam.isPublished || exam.status === 'CLOSED') {
      throw new ExamNotActiveError(`Exam "${exam.title}" (${exam.code}) is not currently active or published`);
    }

    if (exam.startTime && now < new Date(exam.startTime)) {
      throw new ExamNotActiveError(`Exam has not started yet. Starts at: ${exam.startTime}`);
    }

    if (exam.endTime && now > new Date(exam.endTime)) {
      throw new ExamNotActiveError(`Exam closed at: ${exam.endTime}`);
    }

    // 2. Multi-tab Recovery: Kiểm tra xem thí sinh đã có ca thi đang dở chưa
    const activeAttempt = await this.attemptRepo.findActiveAttempt(userId, exam.id);
    if (activeAttempt) {
      const snapshot = await this.examClient.getExamSnapshot(exam.id, activeAttempt.variantCode);
      if (!snapshot) {
        throw new ExamSnapshotNotFoundError(exam.id, activeAttempt.variantCode);
      }

      // LAZY TIMEOUT: Nếu ca thi trước đó đã hết hạn, tự động finalize nó ngay lúc thí sinh truy cập
      if (activeAttempt.status === 'IN_PROGRESS' && activeAttempt.isAnswerTimeExpired(now)) {
        const gracePeriodMs = 15000;
        activeAttempt.submit(now, gracePeriodMs);

        if (snapshot.frozenPayload?.questions) {
          const scoreResult = AttemptScoringEngine.evaluate({
            questions: snapshot.frozenPayload.questions,
            answers: activeAttempt.answers,
            scoringPolicy: snapshot.frozenPayload.scoringPolicy,
            passingScore: 0,
          });
          activeAttempt.grade(scoreResult);
        }

        activeAttempt.incrementVersion();
        await this.attemptRepo.saveAttempt(activeAttempt);
      }

      return {
        attempt: activeAttempt.toDTO(snapshot.sanitizedManifest),
        isRecovered: true,
        manifest: snapshot.sanitizedManifest,
        serverTime: now.toISOString(),
        serverTimestamp: now.getTime(),
      };
    }


    // 3. Lấy Snapshot đề thi bất biến theo variantCode
    const snapshot = await this.examClient.getExamSnapshot(exam.id, variantCode);
    if (!snapshot) {
      throw new ExamSnapshotNotFoundError(exam.id, variantCode);
    }

    // 4. Tạo ca thi mới
    const attemptId = `att_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const attempt = new Attempt({
      id: attemptId,
      userId,
      examId: exam.id,
      snapshotId: snapshot.id,
      variantCode: snapshot.variantCode,
      durationMinutes: snapshot.sanitizedManifest.durationMinutes || exam.durationMinutes,
      status: 'CREATED',
    });

    if (autoStart) {
      attempt.start(now);
    }

    await this.attemptRepo.saveAttempt(attempt);

    return {
      attempt: attempt.toDTO(snapshot.sanitizedManifest),
      isRecovered: false,
      manifest: snapshot.sanitizedManifest,
      serverTime: now.toISOString(),
      serverTimestamp: now.getTime(),
    };
  }
}
