import type { ExamRepositoryPort } from '../../domain/ports/exam.repository.port.js';
import type { UpdateExamInput, ExamDTO } from '@platform/contracts';
import { ExamNotFoundError } from '../../domain/errors/exam-domain.errors.js';

export class UpdateExamUseCase {
  constructor(private examRepo: ExamRepositoryPort) {}

  async execute(id: string, input: UpdateExamInput): Promise<ExamDTO> {
    const exam = await this.examRepo.findExamById(id);
    if (!exam) {
      throw new ExamNotFoundError(id);
    }

    exam.updateDetails({
      title: input.title,
      startTime: input.startTime ? new Date(input.startTime) : input.startTime === null ? null : undefined,
      endTime: input.endTime ? new Date(input.endTime) : input.endTime === null ? null : undefined,
      durationMinutes: input.durationMinutes,
      isPublished: input.isPublished,
      status: input.status,
    });

    await this.examRepo.saveExam(exam);

    const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
    const variants = snapshots.map((s) => s.toVariantSummary());

    return exam.toDTO(variants);
  }

  async publishExam(id: string): Promise<ExamDTO> {
    const exam = await this.examRepo.findExamById(id);
    if (!exam) {
      throw new ExamNotFoundError(id);
    }

    exam.publish();
    await this.examRepo.saveExam(exam);

    const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
    const variants = snapshots.map((s) => s.toVariantSummary());

    return exam.toDTO(variants);
  }

  async unpublishExam(id: string): Promise<ExamDTO> {
    const exam = await this.examRepo.findExamById(id);
    if (!exam) {
      throw new ExamNotFoundError(id);
    }

    exam.unpublish();
    await this.examRepo.saveExam(exam);

    const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
    const variants = snapshots.map((s) => s.toVariantSummary());

    return exam.toDTO(variants);
  }
}
