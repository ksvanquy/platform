import type { ExamRepositoryPort } from '../../domain/ports/exam.repository.port.js';
import { ExamNotFoundError } from '../../domain/errors/exam-domain.errors.js';

export class DeleteExamUseCase {
  constructor(private examRepo: ExamRepositoryPort) {}

  async execute(id: string): Promise<boolean> {
    const exam = await this.examRepo.findExamById(id);
    if (!exam) {
      throw new ExamNotFoundError(id);
    }

    await this.examRepo.deleteSnapshotsByExamId(id);
    return this.examRepo.deleteExam(id);
  }
}
