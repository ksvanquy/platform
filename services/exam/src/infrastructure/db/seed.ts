import { getExamDb } from './connection.js';
import { exams, examSnapshots } from './schema.js';
import { DrizzleExamRepository } from '../repositories/drizzle-exam.repository.js';
import { DirectQuestionClientAdapter } from '../adapters/direct-question-client.adapter.js';
import { DirectAssessmentClientAdapter } from '../adapters/direct-assessment-client.adapter.js';
import { GenerateExamUseCase } from '../../application/use-cases/generate-exam.use-case.js';

export async function seedExamDatabase(): Promise<void> {
  const db = getExamDb();

  // Check if exams already exist
  const existing = await db.select().from(exams).limit(1);
  if (existing.length > 0) {
    return;
  }

  console.log('Seeding initial exams into exam_db...');
  const examRepo = new DrizzleExamRepository();
  const questionClient = new DirectQuestionClientAdapter();
  const assessmentClient = new DirectAssessmentClientAdapter();
  const generateExamUseCase = new GenerateExamUseCase(examRepo, questionClient, assessmentClient);

  try {
    // Try to seed demo exam from first available assessment
    const asmData = await assessmentClient.getAssessmentWithBlueprint('ASM_TOAN_10_01');
    if (asmData) {
      await generateExamUseCase.execute({
        assessmentId: asmData.assessment.id,
        code: 'EXM_TOAN10_HK1',
        title: 'Đề Thi Học Kỳ 1 Môn Toán Lớp 10 (Chính thức)',
        durationMinutes: asmData.blueprint.durationMinutes || 45,
        variantsCount: 4, // Generates 101, 102, 103, 104 variants
        seedBase: 2026,
      });

      // Automatically publish the seeded exam
      const seeded = await examRepo.findExamByCode('EXM_TOAN10_HK1');
      if (seeded) {
        seeded.publish();
        seeded.activate();
        await examRepo.saveExam(seeded);
      }
      console.log('✅ Exam database seeded with demo exam EXM_TOAN10_HK1.');
    }
  } catch (err) {
    console.warn('⚠️ Could not generate initial demo exam during seeding:', (err as Error).message);
  }
}
