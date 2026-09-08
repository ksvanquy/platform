import crypto from 'node:crypto';
import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { QuestionRevision } from '../../domain/entities/question.entity.js';
import {
  QuestionNotFoundError,
  UnauthorizedQuestionAccessError,
  QuestionRevisionNotFoundError,
} from '../../domain/errors/question-domain.errors.js';
import type { QuestionRevisionDTO, QuestionOption, MatchingPair, MediaAsset } from '@platform/contracts';

export interface AddRevisionInput {
  prompt: string;
  options: QuestionOption[];
  pairs?: MatchingPair[];
  explanation?: string;
  rubric?: Record<string, unknown>;
  mediaAssets?: MediaAsset[];
}

export class ManageRevisionsUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async listRevisions(questionId: string): Promise<QuestionRevisionDTO[]> {
    const question = await this.questionRepo.findById(questionId);
    if (!question) {
      throw new QuestionNotFoundError(questionId);
    }
    const revisions = await this.questionRepo.listRevisions(questionId);
    return revisions.map((r) => r.toDTO());
  }

  async getRevision(questionId: string, revisionNumber: number): Promise<QuestionRevisionDTO> {
    const revision = await this.questionRepo.findRevision(questionId, revisionNumber);
    if (!revision) {
      throw new QuestionRevisionNotFoundError(questionId, revisionNumber);
    }
    return revision.toDTO();
  }

  async addRevision(
    questionId: string,
    input: AddRevisionInput,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<QuestionRevisionDTO> {
    const question = await this.questionRepo.findById(questionId);
    if (!question) {
      throw new QuestionNotFoundError(questionId);
    }

    if (userRole !== 'ADMIN' && question.ownerId !== userId) {
      throw new UnauthorizedQuestionAccessError();
    }

    const currentRev = question.currentRevision;
    const nextRevNumber = (currentRev?.revisionNumber ?? 0) + 1;
    const revisionId = `qrev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const newRevision = new QuestionRevision({
      id: revisionId,
      questionId,
      revisionNumber: nextRevNumber,
      prompt: input.prompt,
      options: input.options,
      pairs: input.pairs,
      explanation: input.explanation,
      rubric: input.rubric,
      mediaAssets: input.mediaAssets,
      createdBy: userId,
      createdAt: new Date(),
    });

    question.attachRevision(newRevision);
    await this.questionRepo.save(question, newRevision);
    return newRevision.toDTO();
  }
}
