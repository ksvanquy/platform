import crypto from 'node:crypto';
import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { Question, QuestionRevision } from '../../domain/entities/question.entity.js';
import {
  QuestionCodeAlreadyExistsError,
  InvalidQuestionDataError,
} from '../../domain/errors/question-domain.errors.js';
import type { CreateQuestionInput, QuestionDTO } from '@platform/contracts';

export class CreateQuestionUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async execute(input: CreateQuestionInput, ownerId: string): Promise<QuestionDTO> {
    if (!input.code || input.code.trim().length === 0) {
      throw new InvalidQuestionDataError('Question code is required');
    }
    if (!input.prompt || input.prompt.trim().length === 0) {
      throw new InvalidQuestionDataError('Question prompt is required');
    }

    const existing = await this.questionRepo.findByCode(input.code.trim());
    if (existing) {
      throw new QuestionCodeAlreadyExistsError(input.code.trim());
    }

    const questionId = `q_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const revisionId = `qrev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    const initialRevision = new QuestionRevision({
      id: revisionId,
      questionId,
      revisionNumber: 1,
      prompt: input.prompt,
      options: input.options || [],
      pairs: input.pairs,
      explanation: input.explanation,
      rubric: input.rubric,
      mediaAssets: input.mediaAssets,
      createdBy: ownerId,
      createdAt: now,
    });

    const question = new Question({
      id: questionId,
      code: input.code.trim(),
      type: input.type,
      topicNodeId: input.topicNodeId,
      gradeNodeId: input.gradeNodeId,
      difficulty: input.difficulty,
      defaultPoints: input.defaultPoints ?? 1,
      status: 'ACTIVE',
      currentRevisionId: revisionId,
      ownerId,
      currentRevision: initialRevision,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.questionRepo.save(question, initialRevision);
    return saved.toDTO();
  }
}
