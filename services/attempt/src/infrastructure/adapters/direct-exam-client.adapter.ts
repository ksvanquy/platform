import type { ExamClientPort } from '../../domain/ports/attempt.repository.port.js';
import type { ExamDTO, ExamSnapshotDTO, SanitizedExamManifest } from '@platform/contracts';
import { DrizzleExamRepository } from '@platform/exam-service';

export class DirectExamClientAdapter implements ExamClientPort {
  private examRepo: DrizzleExamRepository;

  constructor(customRepo?: DrizzleExamRepository) {
    this.examRepo = customRepo || new DrizzleExamRepository();
  }

  async getExam(examIdOrCode: string): Promise<ExamDTO | null> {
    let exam = await this.examRepo.findExamById(examIdOrCode);
    if (!exam) {
      exam = await this.examRepo.findExamByCode(examIdOrCode);
    }
    if (!exam) return null;
    const snapshots = await this.examRepo.listSnapshotsByExamId(exam.id);
    const variants = snapshots.map((s) => s.toVariantSummary());
    return exam.toDTO(variants);
  }

  async getExamSnapshot(examId: string, variantCode = 'DEFAULT'): Promise<ExamSnapshotDTO | null> {
    let snapshot = await this.examRepo.findSnapshotByExamAndVariant(examId, variantCode);
    if (!snapshot && variantCode !== 'DEFAULT') {
      snapshot = await this.examRepo.findSnapshotByExamAndVariant(examId, 'DEFAULT');
    }
    if (!snapshot) {
      const all = await this.examRepo.listSnapshotsByExamId(examId);
      if (all.length > 0) {
        snapshot = all[0];
      }
    }
    return snapshot ? snapshot.toDTO() : null;
  }

  async getSanitizedManifest(examId: string, variantCode = 'DEFAULT'): Promise<SanitizedExamManifest | null> {
    const snapshot = await this.getExamSnapshot(examId, variantCode);
    return snapshot ? snapshot.sanitizedManifest : null;
  }
}
