import type {
  ExamRepositoryPort,
  ExamFilterQuery,
  AssessmentClientPort,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamDTO, ExamAssessmentMeta } from '@platform/contracts';

export class ListExamsUseCase {
  constructor(
    private examRepo: ExamRepositoryPort,
    private assessmentClient?: AssessmentClientPort
  ) {}

  async execute(filter?: ExamFilterQuery): Promise<{ exams: ExamDTO[]; total: number }> {
    const { exams, total } = await this.examRepo.listExams(filter);

    const assessmentCache = new Map<string, ExamAssessmentMeta | null>();
    const examDtos: ExamDTO[] = [];

    for (const exam of exams) {
      const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
      const variants = snapshots.map((s) => s.toVariantSummary());

      let assessmentMeta: ExamAssessmentMeta | undefined = undefined;

      if (this.assessmentClient && exam.assessmentId) {
        if (!assessmentCache.has(exam.assessmentId)) {
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
              assessmentCache.set(exam.assessmentId, {
                id: asm.id,
                code: asm.code,
                title: asm.title,
                primaryTopicNodeId: asm.primaryTopicNodeId,
                gradeNodeId: asm.gradeNodeId,
                description: asm.description,
              });
            } else {
              assessmentCache.set(exam.assessmentId, null);
            }
          } catch {
            assessmentCache.set(exam.assessmentId, null);
          }
        }
        assessmentMeta = assessmentCache.get(exam.assessmentId) || undefined;
      }

      examDtos.push(exam.toDTO(variants, assessmentMeta));
    }

    return {
      exams: examDtos,
      total,
    };
  }
}
