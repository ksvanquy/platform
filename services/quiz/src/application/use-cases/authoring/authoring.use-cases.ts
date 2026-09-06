import { Quiz } from '../../../domain/authoring/quiz.entity.js';
import { QuizVersion, AuthoringQuestion, ScoringPolicyConfig, RandomizationPolicy } from '../../../domain/authoring/quiz-version.entity.js';
import { AuthoringRepositoryPort } from '../../../domain/ports/assessment.repository.ports.js';
import { QuizNotFoundError, OwnershipDomainError } from '../../../domain/errors/domain-errors.js';
import { evaluateOwnership } from '@platform/contracts';
import type { Principal } from '@platform/contracts';

export interface CreateQuizInput {
  code: string;
  title: string;
  description?: string;
  ownerId: string;
  primaryNodeId?: string | null;
  isPublic?: boolean;
}

export interface UpdateQuizInput {
  quizId: string;
  title: string;
  description?: string;
  primaryNodeId?: string | null;
  isPublic?: boolean;
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

  async createQuiz(
    input: CreateQuizInput,
    principal?: Principal
  ): Promise<Quiz> {
    const existing = await this.authoringRepo.findQuizByCode(input.code);
    if (existing) {
      throw new Error(`Quiz with code "${input.code}" already exists`);
    }

    const ownerId = principal?.id || input.ownerId;
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const quiz = new Quiz({
      id: quizId,
      code: input.code,
      title: input.title,
      description: input.description,
      ownerId,
      primaryNodeId: input.primaryNodeId,
      isPublic: input.isPublic ?? false,
      status: 'DRAFT',
    });

    await this.authoringRepo.saveQuiz(quiz);
    return quiz;
  }

  async addVersion(
    input: CreateQuizVersionInput,
    principal?: Principal
  ): Promise<QuizVersion> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }

    if (principal) {
      const evaluation = evaluateOwnership(
        principal,
        {
          resourceType: 'quiz',
          resourceId: quiz.id,
          ownerId: quiz.ownerId,
        },
        'quiz:update',
        'quiz:manage_all'
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to modify this quiz'
        );
      }
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

  async updateQuiz(
    input: UpdateQuizInput,
    principal?: Principal
  ): Promise<Quiz> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }

    if (principal) {
      const evaluation = evaluateOwnership(
        principal,
        {
          resourceType: 'quiz',
          resourceId: quiz.id,
          ownerId: quiz.ownerId,
        },
        'quiz:update',
        'quiz:manage_all'
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to update this quiz'
        );
      }
    }

    quiz.updateDetails(input.title, input.description, input.isPublic, input.primaryNodeId);
    await this.authoringRepo.saveQuiz(quiz);
    return quiz;
  }

  async publishQuiz(
    input: PublishQuizInput,
    principal?: Principal
  ): Promise<{ quiz: Quiz; version: QuizVersion }> {
    const quiz = await this.authoringRepo.findQuizById(input.quizId);
    if (!quiz) {
      throw new QuizNotFoundError(input.quizId);
    }

    if (principal) {
      const evaluation = evaluateOwnership(
        principal,
        {
          resourceType: 'quiz',
          resourceId: quiz.id,
          ownerId: quiz.ownerId,
        },
        'quiz:publish',
        'quiz:manage_all'
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to publish this quiz'
        );
      }
    }

    const version = await this.authoringRepo.findVersionById(input.versionId);
    if (!version) {
      throw new Error(`QuizVersion "${input.versionId}" not found`);
    }

    quiz.publish(version);
    await this.authoringRepo.saveQuiz(quiz);

    return { quiz, version };
  }

  async deleteQuiz(
    quizId: string,
    principal?: Principal
  ): Promise<void> {
    const quiz = await this.authoringRepo.findQuizById(quizId);
    if (!quiz) {
      throw new QuizNotFoundError(quizId);
    }

    if (principal) {
      const evaluation = evaluateOwnership(
        principal,
        {
          resourceType: 'quiz',
          resourceId: quiz.id,
          ownerId: quiz.ownerId,
        },
        'quiz:delete',
        'quiz:manage_all'
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to delete this quiz'
        );
      }
    }

    quiz.archive();
    await this.authoringRepo.saveQuiz(quiz);
  }

  async getPublishedQuizzes(filter?: { primaryNodeId?: string; primaryNodeIds?: string[] }): Promise<Quiz[]> {
    return this.authoringRepo.listPublishedQuizzes(filter);
  }

  async getQuizDetails(
    quizId: string,
    principal?: Principal
  ): Promise<{ quiz: Quiz; currentVersion?: QuizVersion }> {
    const quiz = await this.authoringRepo.findQuizById(quizId);
    if (!quiz) {
      throw new QuizNotFoundError(quizId);
    }

    if (quiz.status !== 'PUBLISHED' && principal) {
      const evaluation = evaluateOwnership(
        principal,
        {
          resourceType: 'quiz',
          resourceId: quiz.id,
          ownerId: quiz.ownerId,
        },
        'quiz:read',
        'quiz:manage_all'
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to view this non-published quiz'
        );
      }
    }

    let currentVersion: QuizVersion | undefined;
    if (quiz.currentPublishedVersionId) {
      const v = await this.authoringRepo.findVersionById(quiz.currentPublishedVersionId);
      if (v) currentVersion = v;
    }

    return { quiz, currentVersion };
  }
}
