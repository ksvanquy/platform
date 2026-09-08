import crypto from 'node:crypto';
import type { QuestionRepositoryPort } from '../../domain/ports/question.repository.port.js';
import { Question, QuestionRevision } from '../../domain/entities/question.entity.js';
import {
  QuestionNotFoundError,
  UnauthorizedQuestionAccessError,
} from '../../domain/errors/question-domain.errors.js';
import type { UpdateQuestionInput, QuestionDTO } from '@platform/contracts';

export class UpdateQuestionUseCase {
  constructor(private readonly questionRepo: QuestionRepositoryPort) {}

  async execute(
    id: string,
    input: UpdateQuestionInput,
    userId: string,
    userRole = 'INSTRUCTOR'
  ): Promise<QuestionDTO> {
    const question = await this.questionRepo.findById(id);
    if (!question) {
      throw new QuestionNotFoundError(id);
    }

    if (userRole !== 'ADMIN' && question.ownerId !== userId) {
      throw new UnauthorizedQuestionAccessError('Only the question owner or an admin can update this question.');
    }

    let newRevision: QuestionRevision | undefined;

    // Check if content revision is required
    const hasContentChanges =
      input.prompt !== undefined ||
      input.options !== undefined ||
      input.pairs !== undefined ||
      input.explanation !== undefined ||
      input.rubric !== undefined ||
      input.mediaAssets !== undefined;

    if (hasContentChanges) {
      const currentRev = question.currentRevision;
      const nextRevNumber = (currentRev?.revisionNumber ?? 0) + 1;
      const revisionId = `qrev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      newRevision = new QuestionRevision({
        id: revisionId,
        questionId: question.id,
        revisionNumber: nextRevNumber,
        prompt: input.prompt !== undefined ? input.prompt : currentRev?.prompt || '',
        options: input.options !== undefined ? input.options : currentRev?.options || [],
        pairs: input.pairs !== undefined ? input.pairs : currentRev?.pairs,
        explanation: input.explanation !== undefined ? input.explanation : currentRev?.explanation,
        rubric: input.rubric !== undefined ? input.rubric : currentRev?.rubric,
        mediaAssets: input.mediaAssets !== undefined ? input.mediaAssets : currentRev?.mediaAssets,
        createdBy: userId,
        createdAt: new Date(),
      });

      question.attachRevision(newRevision);
    }

    if (input.status) {
      question.updateStatus(input.status);
    }

    const updatedQuestion = new Question({
      id: question.id,
      code: question.code,
      type: question.type,
      topicNodeId: input.topicNodeId !== undefined ? input.topicNodeId : question.topicNodeId,
      gradeNodeId: input.gradeNodeId !== undefined ? input.gradeNodeId : question.gradeNodeId,
      difficulty: input.difficulty !== undefined ? input.difficulty : question.difficulty,
      defaultPoints: input.defaultPoints !== undefined ? input.defaultPoints : question.defaultPoints,
      status: input.status !== undefined ? input.status : question.status,
      currentRevisionId: question.currentRevisionId,
      ownerId: question.ownerId,
      currentRevision: newRevision || question.currentRevision,
      createdAt: question.createdAt,
      updatedAt: new Date(),
    });

    const saved = await this.questionRepo.save(updatedQuestion, newRevision);
    return saved.toDTO();
  }
}
