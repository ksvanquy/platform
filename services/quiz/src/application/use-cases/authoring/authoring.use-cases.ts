import { Quiz } from '../../../domain/authoring/quiz.entity.js';
import { QuizVersion, AuthoringQuestion, ScoringPolicyConfig, RandomizationPolicy } from '../../../domain/authoring/quiz-version.entity.js';
import { AuthoringRepositoryPort } from '../../../domain/ports/assessment.repository.ports.js';
import { QuizNotFoundError, OwnershipDomainError } from '../../../domain/errors/domain-errors.js';
import { evaluateOwnership, evaluateTenantIsolation } from '@platform/contracts';
import type { Principal, TenantContext } from '@platform/contracts';

export interface CreateQuizInput {
  code: string;
  title: string;
  description?: string;
  ownerId: string;
  tenantId?: string;
  isPublic?: boolean;
}

export interface UpdateQuizInput {
  quizId: string;
  title: string;
  description?: string;
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
    principal?: Principal,
    tenantContext?: TenantContext
  ): Promise<Quiz> {
    const existing = await this.authoringRepo.findQuizByCode(input.code);
    if (existing) {
      throw new Error(`Quiz with code "${input.code}" already exists`);
    }

    const ownerId = principal?.id || input.ownerId;
    const activeTenantId = tenantContext?.tenantId || input.tenantId || 'tenant_default';

    if (tenantContext?.tenantId && input.tenantId && tenantContext.tenantId !== input.tenantId) {
      throw new OwnershipDomainError('Cross-tenant quiz creation prohibited');
    }

    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const quiz = new Quiz({
      id: quizId,
      code: input.code,
      title: input.title,
      description: input.description,
      ownerId,
      tenantId: activeTenantId,
      isPublic: input.isPublic ?? false,
      status: 'DRAFT',
    });

    await this.authoringRepo.saveQuiz(quiz);
    return quiz;
  }

  async addVersion(
    input: CreateQuizVersionInput,
    principal?: Principal,
    tenantContext?: TenantContext
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
          tenantId: quiz.tenantId || 'tenant_default',
        },
        'quiz:update',
        'quiz:manage_all',
        tenantContext
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
    principal?: Principal,
    tenantContext?: TenantContext
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
          tenantId: quiz.tenantId || 'tenant_default',
        },
        'quiz:update',
        'quiz:manage_all',
        tenantContext
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to update this quiz'
        );
      }
    }

    quiz.updateDetails(input.title, input.description, input.isPublic);
    await this.authoringRepo.saveQuiz(quiz);
    return quiz;
  }

  async publishQuiz(
    input: PublishQuizInput,
    principal?: Principal,
    tenantContext?: TenantContext
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
          tenantId: quiz.tenantId || 'tenant_default',
        },
        'quiz:publish',
        'quiz:manage_all',
        tenantContext
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
    principal?: Principal,
    tenantContext?: TenantContext
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
          tenantId: quiz.tenantId || 'tenant_default',
        },
        'quiz:delete',
        'quiz:manage_all',
        tenantContext
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

  async getPublishedQuizzes(): Promise<Quiz[]> {
    return this.authoringRepo.listPublishedQuizzes();
  }

  async getQuizDetails(
    quizId: string,
    principal?: Principal,
    tenantContext?: TenantContext
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
          tenantId: quiz.tenantId || 'tenant_default',
        },
        'quiz:read',
        'quiz:manage_all',
        tenantContext
      );

      if (!evaluation.allowed) {
        throw new OwnershipDomainError(
          evaluation.reason || 'You do not have permission to view this non-published quiz'
        );
      }
    } else if (tenantContext && !quiz.isPublic) {
      if (!evaluateTenantIsolation(tenantContext, { tenantId: quiz.tenantId })) {
        throw new OwnershipDomainError('Cross-tenant access prohibited');
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
