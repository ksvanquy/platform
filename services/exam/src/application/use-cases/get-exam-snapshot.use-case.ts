import type { ExamRepositoryPort } from '../../domain/ports/exam.repository.port.js';
import type {
  ExamSnapshotDTO,
  SanitizedExamManifest,
} from '@platform/contracts';
import {
  ExamNotFoundError,
  ExamSnapshotNotFoundError,
} from '../../domain/errors/exam-domain.errors.js';

export class GetExamSnapshotUseCase {
  constructor(private examRepo: ExamRepositoryPort) {}

  async getSanitizedManifest(
    examIdOrCode: string,
    variantCode: string = 'DEFAULT'
  ): Promise<SanitizedExamManifest> {
    const exam = await this.resolveExam(examIdOrCode);
    let snapshot = await this.examRepo.findSnapshotByExamAndVariant(exam.id, variantCode);

    // If exact variant not found, fallback to DEFAULT variant or first available variant
    if (!snapshot) {
      const all = await this.examRepo.listSnapshotsByExamId(exam.id);
      if (all.length > 0) {
        snapshot = all[0];
      }
    }

    if (!snapshot) {
      throw new ExamSnapshotNotFoundError(`Snapshot variant ${variantCode} for exam ${examIdOrCode}`);
    }

    return snapshot.sanitizedManifest;
  }

  async getFrozenSnapshot(
    examIdOrCode: string,
    variantCode: string = 'DEFAULT'
  ): Promise<ExamSnapshotDTO> {
    const exam = await this.resolveExam(examIdOrCode);
    let snapshot = await this.examRepo.findSnapshotByExamAndVariant(exam.id, variantCode);

    if (!snapshot) {
      const all = await this.examRepo.listSnapshotsByExamId(exam.id);
      if (all.length > 0) {
        snapshot = all[0];
      }
    }

    if (!snapshot) {
      throw new ExamSnapshotNotFoundError(`Frozen snapshot variant ${variantCode} for exam ${examIdOrCode}`);
    }

    return snapshot.toDTO();
  }

  private async resolveExam(idOrCode: string) {
    let exam = await this.examRepo.findExamById(idOrCode);
    if (!exam) {
      exam = await this.examRepo.findExamByCode(idOrCode);
    }
    if (!exam) {
      throw new ExamNotFoundError(idOrCode);
    }
    return exam;
  }
}
