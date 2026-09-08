import { assessments, blueprints } from './schema.js';
import { getAssessmentDb, isAssessmentDbConfigured } from './connection.js';

export async function seedAssessmentDatabase(dbInstance?: any): Promise<void> {
  const db = dbInstance || getAssessmentDb();

  console.log('🌱 [assessment_db] Seeding initial assessments & blueprints into PostgreSQL...');

  const initialAssessments = [
    {
      id: 'asm_math10_midterm',
      code: 'MATH10-MIDTERM-2026',
      title: 'Đề kiểm tra giữa kỳ 1 - Toán 10 (Chương trình chuẩn)',
      description: 'Kiểm tra kiến thức hàm số bậc hai, phương trình quy về bậc hai và phương pháp tọa độ.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_math10_midterm_v1',
      blueprint: {
        id: 'bp_math10_midterm_v1',
        assessmentId: 'asm_math10_midterm',
        versionNumber: 1,
        durationMinutes: 45,
        passingPercentage: 50,
        maxAttempts: 1,
        criteria: [
          {
            topicNodeId: 'node_math_quad_eq',
            difficulty: 'REMEMBER' as const,
            questionCount: 4,
            pointsPerQuestion: 1,
          },
          {
            topicNodeId: 'node_math_quad_eq',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 4,
            pointsPerQuestion: 1,
          },
          {
            topicNodeId: 'node_math_quad_eq',
            difficulty: 'APPLY' as const,
            questionCount: 2,
            pointsPerQuestion: 1,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
      },
    },
    {
      id: 'asm_phys10_review',
      code: 'PHYS10-REV-001',
      title: 'Bài tập trắc nghiệm Động học chất điểm - Vật lý 10',
      description: 'Ôn tập kiến thức chuyển động thẳng đều và biến đổi đều.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_phys_kinematics',
      gradeNodeId: 'node_grade_10',
      status: 'DRAFT' as const,
      currentBlueprintId: 'bp_phys10_review_v1',
      blueprint: {
        id: 'bp_phys10_review_v1',
        assessmentId: 'asm_phys10_review',
        versionNumber: 1,
        durationMinutes: 30,
        passingPercentage: 60,
        maxAttempts: 3,
        criteria: [
          {
            topicNodeId: 'node_phys_kinematics',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 5,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'PARTIAL' as const,
          roundingDecimal: 1,
        },
        isLocked: false,
      },
    },
  ];

  for (const item of initialAssessments) {
    const { blueprint, ...assessmentData } = item;
    await db
      .insert(assessments)
      .values(assessmentData)
      .onConflictDoUpdate({
        target: assessments.id,
        set: {
          code: assessmentData.code,
          title: assessmentData.title,
          description: assessmentData.description,
          status: assessmentData.status,
          currentBlueprintId: assessmentData.currentBlueprintId,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(blueprints)
      .values(blueprint)
      .onConflictDoUpdate({
        target: [blueprints.assessmentId, blueprints.versionNumber],
        set: {
          durationMinutes: blueprint.durationMinutes,
          passingPercentage: blueprint.passingPercentage,
          maxAttempts: blueprint.maxAttempts,
          criteria: blueprint.criteria,
          scoringPolicy: blueprint.scoringPolicy,
          isLocked: blueprint.isLocked,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`✅ [assessment_db] Seed completed: ${initialAssessments.length} assessments seeded.`);
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  if (isAssessmentDbConfigured()) {
    seedAssessmentDatabase()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Skipping Assessment DB seed: ASSESSMENT_DATABASE_URL not configured.');
  }
}
