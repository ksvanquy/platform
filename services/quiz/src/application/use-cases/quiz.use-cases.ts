import type { Principal } from '@platform/contracts';
import { QuizRepositoryPort } from '../../domain/ports/quiz.repository.port.js';
import { QuizSession } from '../../domain/state-machine/quiz-session.js';
import { ScoringFactory, EvaluationResult } from '../../domain/scoring/scoring.factory.js';
import {
  QuizSanitizer,
  SessionAccessGuard,
  AnswerPayloadValidator,
  ResultSanitizer,
  ResultRevealPolicy,
} from '../dtos/quiz.dto.js';
import { PublicQuestion, UserAnswerValue } from '../../domain/entities/quiz.js';

export interface StartAttemptInput {
  principal: Principal;
  quizId: string;
}

export interface StartQuizInput {
  principal?: Principal;
  userId?: string;
  quizId: string;
}

// 1. Use Case: Bắt đầu bài thi (Start Quiz / Start Attempt)
export class StartQuizUseCase {
  constructor(private quizRepo: QuizRepositoryPort) {}

  async execute(input: StartQuizInput): Promise<{
    session: QuizSession;
    questions: PublicQuestion[];
  }> {
    const userId = input.principal?.id || input.userId;
    if (!userId || userId.trim() === '') {
      throw new Error('Principal or userId is required to start a quiz attempt.');
    }

    const quiz = await this.quizRepo.findQuizById(input.quizId);
    if (!quiz) throw new Error('Quiz not found');

    const session = new QuizSession({
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      quizId: input.quizId,
      durationMinutes: quiz.durationMinutes,
      allowedQuestionIds: quiz.questions.map((q) => q.id),
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });

    await this.quizRepo.saveSession(session);

    // Trả về câu hỏi ĐÃ LỌC BỎ ĐÁP ÁN VÀ XÁO TRỘN DỮ LIỆU NHẠY CẢM
    const sanitizedQuiz = QuizSanitizer.sanitizeQuiz(quiz);

    return {
      session,
      questions: sanitizedQuiz.questions,
    };
  }
}

export const StartAttemptUseCase = StartQuizUseCase;

export interface SaveAnswerInput {
  sessionId: string;
  principal?: Principal;
  userId?: string;
  questionId: string;
  answer: UserAnswerValue;
}

// 2. Use Case: Tự động lưu bài làm (Autosave / Save Progress)
export class SaveAnswerUseCase {
  constructor(private quizRepo: QuizRepositoryPort) {}

  async execute(input: SaveAnswerInput): Promise<void> {
    const session = await this.quizRepo.findSessionById(input.sessionId);
    if (!session) throw new Error('Session not found');

    // Security Boundary: Xác thực quyền sở hữu (chống IDOR) từ Principal hoặc userId
    const effectiveUserId = input.principal?.id || input.userId;
    if (effectiveUserId) {
      SessionAccessGuard.verifyOwnership(session, effectiveUserId);
    }

    const quiz = await this.quizRepo.findQuizById(session.quizId);
    if (!quiz) throw new Error('Quiz associated with session not found');

    const question = quiz.questions.find((q) => q.id === input.questionId);
    if (!question) {
      throw new Error(`Question "${input.questionId}" not found in quiz.`);
    }

    // Security Boundary: Làm sạch payload đầu vào & chống injection/buffer overflow
    const cleanAnswer = AnswerPayloadValidator.validateAndClean(question.type, input.answer);

    // State Machine kiểm tra hết giờ & lưu câu trả lời
    session.answerQuestion(input.questionId, cleanAnswer, new Date());

    await this.quizRepo.saveSession(session);
  }
}

export interface SubmitQuizInput {
  sessionId: string;
  principal?: Principal;
  userId?: string;
  policy?: ResultRevealPolicy;
}

// 3. Use Case: Nộp bài & Chấm điểm (Submit Quiz)
export class SubmitQuizUseCase {
  constructor(private quizRepo: QuizRepositoryPort) {}

  async execute(input: SubmitQuizInput): Promise<Partial<EvaluationResult>> {
    const session = await this.quizRepo.findSessionById(input.sessionId);
    if (!session) throw new Error('Session not found');

    // Security Boundary: Xác thực quyền sở hữu (chống IDOR) từ Principal hoặc userId
    const effectiveUserId = input.principal?.id || input.userId;
    if (effectiveUserId) {
      SessionAccessGuard.verifyOwnership(session, effectiveUserId);
    }

    // Idempotent: Nếu đã nộp và có kết quả trước đó, trả về luôn không chấm lại
    if (session.status === 'SUBMITTED' && session.result) {
      return ResultSanitizer.sanitize(session.result, input.policy);
    }

    const quiz = await this.quizRepo.findQuizById(session.quizId);
    if (!quiz) throw new Error('Quiz associated with session not found');

    // Tính điểm độc lập tại Backend
    const evaluationResult = ScoringFactory.calculateScore(
      quiz.questions,
      session.answers,
      quiz.passingPercentage
    );

    // Chuyển trạng thái session sang SUBMITTED/EXPIRED và lưu snapshot kết quả vào bên trong Session
    session.submit(new Date(), evaluationResult);
    await this.quizRepo.saveSession(session);

    // Security Boundary: Áp dụng chính sách hiển thị kết quả
    return ResultSanitizer.sanitize(evaluationResult, input.policy);
  }
}

