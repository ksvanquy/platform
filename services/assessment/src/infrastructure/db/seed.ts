import { assessments, blueprints } from './schema.js';
import { getAssessmentDb, isAssessmentDbConfigured } from './connection.js';
export { isAssessmentDbConfigured };

export async function seedAssessmentDatabase(dbInstance?: any): Promise<void> {
  const db = dbInstance || getAssessmentDb();

  console.log('🌱 [assessment_db] Seeding standardized assessments & blueprints into PostgreSQL...');

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
        maxAttempts: 2,
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
      id: 'asm_it_sql',
      code: 'IT-SQL-QUIZ-2026',
      title: 'Kiểm tra Cơ sở dữ liệu quan hệ & SQL',
      description: 'Đánh giá kiến thức câu lệnh truy vấn SELECT, lọc dữ liệu và chuẩn hóa cơ sở dữ liệu quan hệ.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_it_sql_v1',
      blueprint: {
        id: 'bp_it_sql_v1',
        assessmentId: 'asm_it_sql',
        versionNumber: 1,
        durationMinutes: 15,
        passingPercentage: 60,
        maxAttempts: 3,
        criteria: [
          {
            topicNodeId: 'node_topic_it_db',
            difficulty: 'REMEMBER' as const,
            questionCount: 1,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_it_db',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_it_db',
            difficulty: 'APPLY' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'PARTIAL' as const,
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
            questionCount: 1,
            pointsPerQuestion: 5,
          },
        ],
        scoringPolicy: {
          strategyType: 'PARTIAL' as const,
          roundingDecimal: 1,
        },
        isLocked: false,
      },
    },

    // -------------------------------------------------------------------------
    // TIỂU HỌC: TOÁN 1 (Chân trời sáng tạo)
    // -------------------------------------------------------------------------
    {
      id: 'asm_math1_midterm',
      code: 'MATH1-MIDTERM-2026',
      title: 'Đề kiểm tra Giữa kỳ 1 - Toán 1: Phép cộng trừ trong phạm vi 10',
      description: 'Đánh giá kỹ năng đếm, nhận biết số và thực hiện phép tính cộng trừ trong phạm vi 10 dành cho học sinh lớp 1.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_math',
      gradeNodeId: 'node_grade_1',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_math1_midterm_v1',
      blueprint: {
        id: 'bp_math1_midterm_v1',
        assessmentId: 'asm_math1_midterm',
        versionNumber: 1,
        durationMinutes: 20,
        passingPercentage: 60,
        maxAttempts: 3,
        criteria: [
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 3,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 1,
        },
        isLocked: true,
      },
    },

    // -------------------------------------------------------------------------
    // TIỂU HỌC: TOÁN 5 (Ôn tập & Khảo sát Năng lực Cuối kỳ)
    // -------------------------------------------------------------------------
    {
      id: 'asm_math5_final',
      code: 'MATH5-FINAL-2026',
      title: 'Đề Khảo sát Năng lực Môn Toán 5: Phân số & Số thập phân',
      description: 'Khảo sát năng lực toàn diện Toán 5: Các phép tính với phân số, số thập phân, hình học phẳng và giải toán có lời văn.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_math',
      gradeNodeId: 'node_grade_5',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_math5_final_v1',
      blueprint: {
        id: 'bp_math5_final_v1',
        assessmentId: 'asm_math5_final',
        versionNumber: 1,
        durationMinutes: 35,
        passingPercentage: 60,
        maxAttempts: 2,
        criteria: [
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'APPLY' as const,
            questionCount: 1,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
      },
    },

    // -------------------------------------------------------------------------
    // THCS: TOÁN 9 (Ôn thi vào lớp 10)
    // -------------------------------------------------------------------------
    {
      id: 'asm_math9_admission',
      code: 'MATH9-ENTRANCE-2026',
      title: 'Đề Khảo sát Năng lực Toán 9 - Ôn thi vào lớp 10',
      description: 'Hệ thống hóa kiến thức trọng tâm căn bậc hai, hệ phương trình bậc nhất hai ẩn và hệ thức lượng trong tam giác vuông.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_math',
      gradeNodeId: 'node_grade_9',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_math9_admission_v1',
      blueprint: {
        id: 'bp_math9_admission_v1',
        assessmentId: 'asm_math9_admission',
        versionNumber: 1,
        durationMinutes: 60,
        passingPercentage: 50,
        maxAttempts: 2,
        criteria: [
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'APPLY' as const,
            questionCount: 1,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
      },
    },

    // -------------------------------------------------------------------------
    // THCS: TIẾNG ANH 8 (Global Success)
    // -------------------------------------------------------------------------
    {
      id: 'asm_eng8_midterm',
      code: 'ENG8-MIDTERM-2026',
      title: 'Đề thi Giữa kỳ 1 - Tiếng Anh 8 (Global Success)',
      description: 'Kiểm tra phát âm, từ vựng chủ đề Life in the countryside và ngữ pháp so sánh của trạng từ, câu điều kiện loại 1.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_lang_en',
      gradeNodeId: 'node_grade_8',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_eng8_midterm_v1',
      blueprint: {
        id: 'bp_eng8_midterm_v1',
        assessmentId: 'asm_eng8_midterm',
        versionNumber: 1,
        durationMinutes: 45,
        passingPercentage: 50,
        maxAttempts: 3,
        criteria: [
          {
            topicNodeId: 'node_topic_lang_en',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2.5,
          },
          {
            topicNodeId: 'node_topic_lang_en',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2.5,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
      },
    },

    // -------------------------------------------------------------------------
    // THPT: VẬT LÝ 10 (Động học chất điểm)
    // -------------------------------------------------------------------------
    {
      id: 'asm_phys10_midterm',
      code: 'PHYS10-MIDTERM-2026',
      title: 'Kiểm tra Định kỳ Vật lý 10: Động học Chất điểm & Chuyển động biến đổi đều',
      description: 'Kiểm tra kiến thức chuyển động thẳng biến đổi đều, gia tốc, vận tốc, rơi tự do và các hệ thức độc lập thời gian.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_phys_kinematics',
      gradeNodeId: 'node_grade_10',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_phys10_midterm_v1',
      blueprint: {
        id: 'bp_phys10_midterm_v1',
        assessmentId: 'asm_phys10_midterm',
        versionNumber: 1,
        durationMinutes: 45,
        passingPercentage: 50,
        maxAttempts: 2,
        criteria: [
          {
            topicNodeId: 'node_phys_kinematics',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_phys_kinematics',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_phys_kinematics',
            difficulty: 'APPLY' as const,
            questionCount: 1,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
      },
    },

    // -------------------------------------------------------------------------
    // THPT: TOÁN 12 (Luyện thi Tốt nghiệp THPT Quốc gia)
    // -------------------------------------------------------------------------
    {
      id: 'asm_math12_national',
      code: 'MATH12-THPTQG-2026',
      title: 'Đề Khảo sát Toán 12 - Luyện thi Tốt nghiệp THPT Quốc gia',
      description: 'Đề thi khảo sát chất lượng kiến thức giải tích 12 (đạo hàm, khảo sát hàm số, nguyên hàm tích phân), số phức và hình học không gian.',
      ownerId: 'usr_instructor_01',
      primaryTopicNodeId: 'node_topic_math',
      gradeNodeId: 'node_grade_12',
      status: 'APPROVED' as const,
      currentBlueprintId: 'bp_math12_national_v1',
      blueprint: {
        id: 'bp_math12_national_v1',
        assessmentId: 'asm_math12_national',
        versionNumber: 1,
        durationMinutes: 90,
        passingPercentage: 50,
        maxAttempts: 2,
        criteria: [
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'REMEMBER' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'UNDERSTAND' as const,
            questionCount: 2,
            pointsPerQuestion: 2,
          },
          {
            topicNodeId: 'node_topic_math',
            difficulty: 'APPLY' as const,
            questionCount: 1,
            pointsPerQuestion: 2,
          },
        ],
        scoringPolicy: {
          strategyType: 'STANDARD' as const,
          roundingDecimal: 2,
        },
        isLocked: true,
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
          primaryTopicNodeId: assessmentData.primaryTopicNodeId,
          gradeNodeId: assessmentData.gradeNodeId,
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

  console.log(`✅ [assessment_db] Seed completed: ${initialAssessments.length} assessments & locked blueprints seeded.`);
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
