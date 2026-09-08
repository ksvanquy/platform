import crypto from 'node:crypto';
import type {
  ExamRepositoryPort,
  QuestionClientPort,
  AssessmentClientPort,
} from '../../domain/ports/exam.repository.port.js';
import type { GenerateExamInput, ExamDTO } from '@platform/contracts';
import { Exam } from '../../domain/entities/exam.entity.js';
import { MatrixSolverService } from '../../domain/services/matrix-solver.service.js';
import {
  ExamAlreadyExistsError,
  InvalidExamDataError,
  ExamNotFoundError,
} from '../../domain/errors/exam-domain.errors.js';

export class GenerateExamUseCase {
  constructor(
    private examRepo: ExamRepositoryPort,
    private questionClient: QuestionClientPort,
    private assessmentClient: AssessmentClientPort
  ) {}

  async execute(input: GenerateExamInput): Promise<ExamDTO> {
    if (!input.assessmentId) {
      throw new InvalidExamDataError('Assessment ID is required to generate an exam');
    }
    if (!input.code || input.code.trim().length === 0) {
      throw new InvalidExamDataError('Exam code is required');
    }
    if (!input.title || input.title.trim().length === 0) {
      throw new InvalidExamDataError('Exam title is required');
    }

    // 1. Check if exam code already exists
    const existing = await this.examRepo.findExamByCode(input.code.trim());
    if (existing) {
      throw new ExamAlreadyExistsError(input.code.trim());
    }

    // 2. Fetch assessment & blueprint
    const assessmentData = await this.assessmentClient.getAssessmentWithBlueprint(input.assessmentId);
    if (!assessmentData) {
      throw new ExamNotFoundError(`Assessment blueprint not found: ${input.assessmentId}`);
    }

    const { assessment, blueprint } = assessmentData;
    const durationMinutes = input.durationMinutes || blueprint.durationMinutes || 45;
    const seedBase = input.seedBase ?? Math.floor(Math.random() * 1000000) + 1337;
    const variantsCount = input.variantsCount || 1;

    // 3. Fetch questions matching criteria or related topic
    const availableQuestions = await this.questionClient.getQuestions({
      topicNodeId: assessment.primaryTopicNodeId || undefined,
      gradeNodeId: assessment.gradeNodeId || undefined,
      status: 'ACTIVE',
    });

    // 4. Generate Exam ID and solve matrix
    const examId = `exm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const { snapshots } = MatrixSolverService.solveMatrix({
      examId: examId,
      examCode: input.code.trim(),
      examTitle: input.title.trim(),
      durationMinutes: durationMinutes,
      seedBase: seedBase,
      variantsCount: variantsCount,
      criteria: blueprint.criteria || [],
      scoringPolicy: blueprint.scoringPolicy,
      availableQuestions: availableQuestions,
    });

    // 5. Create Exam entity
    const exam = new Exam({
      id: examId,
      assessmentId: assessment.id,
      code: input.code.trim(),
      title: input.title.trim(),
      startTime: input.startTime ? new Date(input.startTime) : null,
      endTime: input.endTime ? new Date(input.endTime) : null,
      durationMinutes: durationMinutes,
      isPublished: false,
      randomizationSeedBase: seedBase,
      status: 'READY',
      createdAt: new Date(),
    });

    // 6. Persist Exam and Snapshots
    await this.examRepo.saveExam(exam);
    for (const snapshot of snapshots) {
      await this.examRepo.saveSnapshot(snapshot);
    }

    const variants = snapshots.map((s) => s.toVariantSummary());
    return exam.toDTO(variants);
  }
}
