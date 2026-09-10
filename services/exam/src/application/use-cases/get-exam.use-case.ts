import type {
  ExamRepositoryPort,
  AssessmentClientPort,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamDTO, ExamAssessmentMeta } from '@platform/contracts';
import { ExamNotFoundError } from '../../domain/errors/exam-domain.errors.js';

export class GetExamUseCase {
  constructor(
    private examRepo: ExamRepositoryPort,
    private assessmentClient?: AssessmentClientPort
  ) {}

  async execute(idOrCode: string): Promise<ExamDTO> {
    let exam = await this.examRepo.findExamById(idOrCode);
    if (!exam) {
      exam = await this.examRepo.findExamByCode(idOrCode);
    }
    if (!exam) {
      throw new ExamNotFoundError(idOrCode);
    }

    const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
    const variants = snapshots.map((s) => s.toVariantSummary());

    let assessmentMeta: ExamAssessmentMeta | undefined = undefined;
    if (this.assessmentClient && exam.assessmentId) {
      try {
        let asm: any = null;
        if (typeof this.assessmentClient.getAssessment === 'function') {
          asm = await this.assessmentClient.getAssessment(exam.assessmentId);
        }
        if (!asm) {
          const res = await this.assessmentClient.getAssessmentWithBlueprint(exam.assessmentId);
          asm = res?.assessment || null;
        }

        if (asm) {
          assessmentMeta = {
            id: asm.id,
            code: asm.code,
            title: asm.title,
            primaryTopicNodeId: asm.primaryTopicNodeId,
            gradeNodeId: asm.gradeNodeId,
            description: asm.description,
          };
        }
      } catch {
        // Silently fallback if assessment service unavailable
      }
    }

    return exam.toDTO(variants, assessmentMeta);
  }
}
