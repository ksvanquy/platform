import { isExamDbConfigured } from './connection.js';
export { isExamDbConfigured };
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

  async function ensureExamSeeded(config: {
    code: string;
    title: string;
    assessmentId: string;
    assessmentCode?: string;
    variantsCount: number;
    seedBase: number;
  }) {
    const existing = await examRepo.findExamByCode(config.code);
    if (!existing) {
      try {
        let asmData = await assessmentClient.getAssessmentWithBlueprint(config.assessmentId);
        if (!asmData && config.assessmentCode) {
          asmData = await assessmentClient.getAssessmentWithBlueprint(config.assessmentCode);
        }

        if (asmData) {
          await generateExamUseCase.execute({
            assessmentId: asmData.assessment.id,
            code: config.code,
            title: config.title,
            durationMinutes: asmData.blueprint.durationMinutes || 45,
            variantsCount: config.variantsCount,
            seedBase: config.seedBase,
          });

          const seeded = await examRepo.findExamByCode(config.code);
          if (seeded) {
            seeded.publish();
            seeded.activate();
            await examRepo.saveExam(seeded);
            console.log(`✅ [exam_db] Successfully generated & published exam ${config.code} (${config.variantsCount} variants).`);
          }
        } else {
          console.warn(`⚠️ [exam_db] Assessment ${config.assessmentId} not found for exam generation.`);
        }
      } catch (err: any) {
        console.warn(`⚠️ [exam_db] Could not generate ${config.code}:`, err?.message || err);
      }
    } else {
      if (!existing.isPublished || existing.status !== 'ACTIVE') {
        existing.publish();
        existing.activate();
        await examRepo.saveExam(existing);
      }
      const snapshots = await examRepo.listSnapshotsByExamId(existing.id);
      if (snapshots.length === 0) {
        try {
          await generateVariantsUseCase.execute(existing.id, config.variantsCount);
          console.log(`✅ [exam_db] Generated missing variants for existing ${config.code}.`);
        } catch (err: any) {
          console.warn(`⚠️ [exam_db] Could not generate variants for existing ${config.code}:`, err?.message || err);
        }
      }
    }
  }

  // 1. Math 10 Official Exam (EXM_TOAN10_HK1) - 4 variants
  await ensureExamSeeded({
    code: 'EXM_TOAN10_HK1',
    title: 'Đề Thi Giữa Kỳ 1 Môn Toán Lớp 10 (Chính thức)',
    assessmentId: 'asm_math10_midterm',
    assessmentCode: 'MATH10-MIDTERM-2026',
    variantsCount: 4,
    seedBase: 2026,
  });

  // 2. IT SQL Quiz Exam (EXM_IT_SQL_01) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_IT_SQL_01',
    title: 'Bài Kiểm Tra SQL & Cơ Sở Dữ Liệu Quan Hệ',
    assessmentId: 'asm_it_sql',
    assessmentCode: 'IT-SQL-QUIZ-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 3. TIỂU HỌC: Toán 1 (EXM_TOAN1_GK1) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_TOAN1_GK1',
    title: 'Đề Thi Giữa Kỳ 1 Môn Toán Lớp 1 (Chính thức)',
    assessmentId: 'asm_math1_midterm',
    assessmentCode: 'MATH1-MIDTERM-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 4. TIỂU HỌC: Toán 5 (EXM_TOAN5_CK) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_TOAN5_CK',
    title: 'Đề Khảo Sát Năng Lực Cuối Kỳ Môn Toán Lớp 5',
    assessmentId: 'asm_math5_final',
    assessmentCode: 'MATH5-FINAL-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 5. THCS: Toán 9 (EXM_TOAN9_VAO10) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_TOAN9_VAO10',
    title: 'Đề Thi Khảo Sát Toán 9 Tuyển Sinh Lớp 10',
    assessmentId: 'asm_math9_admission',
    assessmentCode: 'MATH9-ENTRANCE-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 6. THCS: Tiếng Anh 8 (EXM_ENG8_GK1) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_ENG8_GK1',
    title: 'Đề Kiểm Tra Giữa Kỳ 1 Môn Tiếng Anh Lớp 8',
    assessmentId: 'asm_eng8_midterm',
    assessmentCode: 'ENG8-MIDTERM-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 7. THPT: Vật lý 10 (EXM_PHYS10_GK1) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_PHYS10_GK1',
    title: 'Đề Kiểm Tra Định Kỳ Vật Lý Lớp 10',
    assessmentId: 'asm_phys10_midterm',
    assessmentCode: 'PHYS10-MIDTERM-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

  // 8. THPT: Toán 12 THPTQG (EXM_TOAN12_THPTQG) - 2 variants
  await ensureExamSeeded({
    code: 'EXM_TOAN12_THPTQG',
    title: 'Đề Thi Khảo Sát Toán 12 - Luyện Thi Tốt Nghiệp THPT',
    assessmentId: 'asm_math12_national',
    assessmentCode: 'MATH12-THPTQG-2026',
    variantsCount: 2,
    seedBase: 2026,
  });

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
