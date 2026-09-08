import type {
  ExamRepositoryPort,
  ExamFilterQuery,
} from '../../domain/ports/exam.repository.port.js';
import type { ExamDTO } from '@platform/contracts';

export class ListExamsUseCase {
  constructor(private examRepo: ExamRepositoryPort) {}

  async execute(filter?: ExamFilterQuery): Promise<{ exams: ExamDTO[]; total: number }> {
    const { exams, total } = await this.examRepo.listExams(filter);

    const examDtos: ExamDTO[] = [];
    for (const exam of exams) {
      const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
      const variants = snapshots.map((s) => s.toVariantSummary());
      examDtos.push(exam.toDTO(variants));
    }

    return {
      exams: examDtos,
      total,
    };
  }
}
