import type {
  ExamRepositoryPort,
  QuestionClientPort,
  AssessmentClientPort,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamDTO } from '@platform/contracts';
import { MatrixSolverService } from '../../domain/services/matrix-solver.service.js';
import { ExamNotFoundError } from '../../domain/errors/exam-domain.errors.js';

export class GenerateVariantsUseCase {
  constructor(
    private examRepo: ExamRepositoryPort,
    private questionClient: QuestionClientPort,
    private assessmentClient: AssessmentClientPort
  ) {}

  async execute(examIdOrCode: string, variantsCount: number = 4): Promise<ExamDTO> {
    let exam = await this.examRepo.findExamById(examIdOrCode);
    if (!exam) {
      exam = await this.examRepo.findExamByCode(examIdOrCode);
    }
    if (!exam) {
      throw new ExamNotFoundError(examIdOrCode);
    }

    const assessmentData = await this.assessmentClient.getAssessmentWithBlueprint(exam.assessmentId);
    if (!assessmentData) {
      throw new ExamNotFoundError(`Assessment blueprint not found: ${exam.assessmentId}`);
    }

    const { assessment, blueprint } = assessmentData;
    const availableQuestions = await this.questionClient.getQuestions({
      topicNodeId: assessment.primaryTopicNodeId || undefined,
      gradeNodeId: assessment.gradeNodeId || undefined,
      status: 'ACTIVE',
    });

    const { snapshots, masterPayload } = MatrixSolverService.solveMatrix({
      examId: exam.id,
      examCode: exam.code,
      examTitle: exam.title,
      durationMinutes: exam.durationMinutes,
      seedBase: exam.randomizationSeedBase,
      variantsCount: variantsCount,
      criteria: blueprint.criteria || [],
      scoringPolicy: blueprint.scoringPolicy,
      availableQuestions: availableQuestions,
    });

    // Delete existing snapshots and replace with new variant set
    await this.examRepo.deleteSnapshotsByExamId(exam.id);
    if (this.examRepo.saveSnapshots) {
      await this.examRepo.saveSnapshots(snapshots, masterPayload);
    } else {
      if (this.examRepo.saveMasterPayload) {
        await this.examRepo.saveMasterPayload(exam.id, masterPayload);
      }
      for (const snapshot of snapshots) {
        await this.examRepo.saveSnapshot(snapshot);
      }
    }

    const variants = snapshots.map((s) => s.toVariantSummary());
    return exam.toDTO(variants);
  }
}
