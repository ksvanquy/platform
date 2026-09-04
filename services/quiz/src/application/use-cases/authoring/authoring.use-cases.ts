import { Quiz } from '../../../domain/authoring/quiz.entity.js';
import { QuizVersion, AuthoringQuestion, ScoringPolicyConfig, RandomizationPolicy } from '../../../domain/authoring/quiz-version.entity.js';
import { AuthoringRepositoryPort } from '../../../domain/ports/assessment.repository.ports.js';
import { QuizNotFoundError } from '../../../domain/errors/domain-errors.js';

export interface CreateQuizInput {
  code: string;
  title: string;
  description?: string;
  ownerId: string;
}

export interface CreateQuizVersionInput {
  quizId: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts?: number;
  questions: readonly AuthoringQuestion[];
  scoringPolicy: ScoringPolicyConfig;
  randomizationPolicy: RandomizationPolicy;
}

export interface PublishQuizInput {
  quizId: string;
  versionId: string;
}

export class AuthoringUseCases {
  constructor(private authoringRepo: AuthoringRepositoryPort) {}

  async createQuiz(input: CreateQuizInput): Promise<Quiz> {
    const existing = await this.authoringRepo.findQuizByCode(input.code);
    if (existing) {
      throw new Error(`Quiz with code "${input.code}" already exists`);
    }

    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const quiz = new Quiz({
      id: quizId,
      code: input.code,
      title: input.title,
      description: input.description,
      ownerId: input.ownerId,
      status: 'DRAFT',
    });

    await this.authoringRepo.saveQuiz(quiz);
    return quiz;
  }

  async addVersion(input: CreateQuizVersionInput): Promise<QuizVersion> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }

    const existingVersions = await this.authoringRepo.listVersionsByQuizId(input.quizId);
    const nextVersionNumber = existingVersions.length + 1;
    const versionId = `ver_${input.quizId}_v${nextVersionNumber}`;

    const version = new QuizVersion({
      id: versionId,
      quizId: input.quizId,
      versionNumber: nextVersionNumber,
      durationMinutes: input.durationMinutes,
      passingScore: input.passingScore,
      maxAttempts: input.maxAttempts ?? 1,
      questions: input.questions,
      scoringPolicy: input.scoringPolicy,
      randomizationPolicy: input.randomizationPolicy,
    });

    await this.authoringRepo.saveVersion(version);
    return version;
  }

  async publishQuiz(input: PublishQuizInput): Promise<{ quiz: Quiz; version: QuizVersion }> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }

    const version = await this.authoringRepo.findVersionById(input.versionId);
    if (!version) {
      throw new Error(`QuizVersion "${input.versionId}" not found`);
    }

    quiz.publish(version);
    await this.authoringRepo.saveQuiz(quiz);

    return { quiz, version };
  }

  async getPublishedQuizzes(): Promise<Quiz[]> {
    return this.authoringRepo.listPublishedQuizzes();
  }

  async getQuizDetails(quizId: string): Promise<{ quiz: Quiz; currentVersion?: QuizVersion }> {
    const quiz = await this.authoringRepo.findQuizById(quizId);
    if (!quiz) {
      throw new QuizNotFoundError(quizId);
    }

    let currentVersion: QuizVersion | undefined;
    if (quiz.currentPublishedVersionId) {
      const v = await this.authoringRepo.findVersionById(quiz.currentPublishedVersionId);
      if (v) currentVersion = v;
    }

    return { quiz, currentVersion };
  }
}
