import { getExamDb, isExamDbConfigured } from './connection.js';
export { isExamDbConfigured };
import { exams } from './schema.js';
import { DrizzleExamRepository } from '../repositories/drizzle-exam.repository.js';
import { DirectQuestionClientAdapter } from '../adapters/direct-question-client.adapter.js';
import { DirectAssessmentClientAdapter } from '../adapters/direct-assessment-client.adapter.js';
import { GenerateExamUseCase } from '../../application/use-cases/generate-exam.use-case.js';
import { GenerateVariantsUseCase } from '../../application/use-cases/generate-variants.use-case.js';

export async function seedExamDatabase(
  customExamRepo?: DrizzleExamRepository,
  customQClient?: DirectQuestionClientAdapter,
  customAsmClient?: DirectAssessmentClientAdapter
): Promise<void> {
  const examRepo = customExamRepo || new DrizzleExamRepository();
  const questionClient = customQClient || new DirectQuestionClientAdapter();
  const assessmentClient = customAsmClient || new DirectAssessmentClientAdapter();
  const generateExamUseCase = new GenerateExamUseCase(examRepo, questionClient, assessmentClient);
  const generateVariantsUseCase = new GenerateVariantsUseCase(examRepo, questionClient, assessmentClient);

  // 1. Seed Math 10 Official Exam (EXM_TOAN10_HK1)
  const existingMath = await examRepo.findExamByCode('EXM_TOAN10_HK1');
  if (!existingMath) {
    try {
      const asmData =
        (await assessmentClient.getAssessmentWithBlueprint('asm_math10_midterm')) ||
        (await assessmentClient.getAssessmentWithBlueprint('MATH10-MIDTERM-2026'));

      if (asmData) {
        await generateExamUseCase.execute({
          assessmentId: asmData.assessment.id,
          code: 'EXM_TOAN10_HK1',
          title: 'Đề Thi Giữa Kỳ 1 Môn Toán Lớp 10 (Chính thức)',
          durationMinutes: asmData.blueprint.durationMinutes || 45,
          variantsCount: 4, // Sinh 4 mã đề: 101, 102, 103, 104
          seedBase: 2026,
        });

        const seeded = await examRepo.findExamByCode('EXM_TOAN10_HK1');
        if (seeded) {
          seeded.publish();
          seeded.activate();
          await examRepo.saveExam(seeded);
          console.log('✅ [exam_db] Successfully generated & published exam EXM_TOAN10_HK1 (4 variants).');
        }
      } else {
        console.warn('⚠️ [exam_db] Assessment asm_math10_midterm not found for exam generation.');
      }
    } catch (err: any) {
      console.warn('⚠️ [exam_db] Could not generate EXM_TOAN10_HK1:', err?.message || err);
    }
  } else {
    // Ensure existing Math exam is published & active
    if (!existingMath.isPublished || existingMath.status !== 'ACTIVE') {
      existingMath.publish();
      existingMath.activate();
      await examRepo.saveExam(existingMath);
    }
    const snapshots = await examRepo.listSnapshotsByExamId(existingMath.id);
    if (snapshots.length === 0) {
      try {
        await generateVariantsUseCase.execute(existingMath.id, 4);
        console.log('✅ [exam_db] Generated missing variants for existing EXM_TOAN10_HK1.');
      } catch (err: any) {
        console.warn('⚠️ [exam_db] Could not generate variants for existing EXM_TOAN10_HK1:', err?.message || err);
      }
    }
  }

  // 2. Seed IT SQL Quiz Exam (EXM_IT_SQL_01)
  const existingIT = await examRepo.findExamByCode('EXM_IT_SQL_01');
  if (!existingIT) {
    try {
      const itAsmData =
        (await assessmentClient.getAssessmentWithBlueprint('asm_it_sql')) ||
        (await assessmentClient.getAssessmentWithBlueprint('IT-SQL-QUIZ-2026'));

      if (itAsmData) {
        await generateExamUseCase.execute({
          assessmentId: itAsmData.assessment.id,
          code: 'EXM_IT_SQL_01',
          title: 'Bài Kiểm Tra SQL & Cơ Sở Dữ Liệu Quan Hệ',
          durationMinutes: itAsmData.blueprint.durationMinutes || 15,
          variantsCount: 2, // Sinh 2 mã đề: 101, 102
          seedBase: 2026,
        });

        const seededIT = await examRepo.findExamByCode('EXM_IT_SQL_01');
        if (seededIT) {
          seededIT.publish();
          seededIT.activate();
          await examRepo.saveExam(seededIT);
          console.log('✅ [exam_db] Successfully generated & published exam EXM_IT_SQL_01 (2 variants).');
        }
      }
    } catch (err: any) {
      console.warn('⚠️ [exam_db] Could not generate EXM_IT_SQL_01:', err?.message || err);
    }
  } else {
    // Ensure existing IT exam is published & active
    if (!existingIT.isPublished || existingIT.status !== 'ACTIVE') {
      existingIT.publish();
      existingIT.activate();
      await examRepo.saveExam(existingIT);
    }
    const itSnapshots = await examRepo.listSnapshotsByExamId(existingIT.id);
    if (itSnapshots.length === 0) {
      try {
        await generateVariantsUseCase.execute(existingIT.id, 2);
        console.log('✅ [exam_db] Generated missing variants for existing EXM_IT_SQL_01.');
      } catch (err: any) {
        console.warn('⚠️ [exam_db] Could not generate variants for existing EXM_IT_SQL_01:', err?.message || err);
      }
    }
  }

  console.log('✅ [exam_db] Exam database seed completed.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  if (isExamDbConfigured()) {
    seedExamDatabase()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Skipping Exam DB seed: EXAM_DATABASE_URL not configured.');
  }
}
