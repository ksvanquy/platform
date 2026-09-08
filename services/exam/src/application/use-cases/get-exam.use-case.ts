import type { ExamRepositoryPort } from '../../domain/ports/exam.repository.port.js';
import type { ExamDTO } from '@platform/contracts';
import { ExamNotFoundError } from '../../domain/errors/exam-domain.errors.js';

export class GetExamUseCase {
  constructor(private examRepo: ExamRepositoryPort) {}

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

    return exam.toDTO(variants);
  }
}
