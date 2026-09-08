import { questions, questionRevisions } from './schema.js';
import { getQuestionDb, isQuestionDbConfigured } from './connection.js';

export async function seedQuestionDatabase(dbInstance?: any): Promise<void> {
  const db = dbInstance || getQuestionDb();

  console.log('🌱 [question_db] Seeding initial questions into PostgreSQL...');

  const initialQuestions = [
    {
      id: 'q_math10_quad_001',
      code: 'MATH10-QUAD-001',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_001_v1',
        questionId: 'q_math10_quad_001',
        revisionNumber: 1,
        prompt: 'Công thức nghiệm của phương trình bậc hai $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$) với biệt thức $$\\Delta = b^2 - 4ac > 0$$ là:',
        options: [
          { id: 'opt_1', content: '$$x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$', isCorrect: true, explanation: 'Công thức nghiệm chuẩn xác khi $\\Delta > 0$' },
          { id: 'opt_2', content: '$$x_{1,2} = \\frac{-b \\pm \\Delta}{2a}$$', isCorrect: false },
          { id: 'opt_3', content: '$$x_{1,2} = \\frac{b \\pm \\sqrt{\\Delta}}{2a}$$', isCorrect: false },
          { id: 'opt_4', content: '$$x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{a}$$', isCorrect: false },
        ],
        explanation: 'Phương trình bậc hai $ax^2 + bx + c = 0$ ($a \\neq 0$) có biệt thức $\\Delta = b^2 - 4ac$. Khi $\\Delta > 0$, phương trình có 2 nghiệm phân biệt: $x_{1,2} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$.',
        createdBy: 'usr_instructor_01',
      },
    },
    {
      id: 'q_math10_quad_002',
      code: 'MATH10-QUAD-002',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_002_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_002_v1',
        questionId: 'q_math10_quad_002',
        revisionNumber: 1,
        prompt: 'Tìm tập nghiệm của phương trình $$2x^2 - 5x + 2 = 0$$:',
        options: [
          { id: 'opt_21', content: '$$S = \\{2; \\frac{1}{2}\\}$$', isCorrect: true, explanation: 'Ta có $\\Delta = 25 - 16 = 9 > 0 \\implies x_1 = 2, x_2 = 1/2$' },
          { id: 'opt_22', content: '$$S = \\{-2; -\\frac{1}{2}\\}$$', isCorrect: false },
          { id: 'opt_23', content: '$$S = \\{1; 2\\}$$', isCorrect: false },
          { id: 'opt_24', content: '$$S = \\emptyset$$', isCorrect: false },
        ],
        explanation: 'Biệt thức $\\Delta = (-5)^2 - 4(2)(2) = 25 - 16 = 9 = 3^2$. Các nghiệm là: $x_1 = \\frac{5 + 3}{4} = 2$, $x_2 = \\frac{5 - 3}{4} = \\frac{1}{2}$.',
        createdBy: 'usr_instructor_01',
      },
    },
    {
      id: 'q_phys10_kinematics_001',
      code: 'PHYS10-KIN-001',
      type: 'SINGLE' as const,
      topicNodeId: 'node_phys_kinematics',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_phys10_kinematics_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_phys10_kinematics_001_v1',
        questionId: 'q_phys10_kinematics_001',
        revisionNumber: 1,
        prompt: 'Trong chuyển động thẳng biến đổi đều, phương trình vận tốc theo thời gian có dạng:',
        options: [
          { id: 'opt_p1', content: '$$v = v_0 + at$$', isCorrect: true },
          { id: 'opt_p2', content: '$$v = v_0 + \\frac{1}{2}at^2$$', isCorrect: false },
          { id: 'opt_p3', content: '$$x = x_0 + v_0t$$', isCorrect: false },
          { id: 'opt_p4', content: '$$v^2 - v_0^2 = at$$', isCorrect: false },
        ],
        explanation: 'Phương trình vận tốc tức thời trong chuyển động thẳng biến đổi đều là $v = v_0 + at$.',
        createdBy: 'usr_instructor_01',
      },
    },
    {
      id: 'q_math10_match_001',
      code: 'MATH10-MATCH-001',
      type: 'MATCHING' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'ANALYZE' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_match_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_match_001_v1',
        questionId: 'q_math10_match_001',
        revisionNumber: 1,
        prompt: 'Nối điều kiện của biệt thức $$\\Delta$$ với số nghiệm tương ứng của phương trình $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$):',
        options: [],
        pairs: [
          { leftId: 'l1', leftText: '$$\\Delta > 0$$', rightId: 'r1', rightText: 'Có hai nghiệm phân biệt' },
          { leftId: 'l2', leftText: '$$\\Delta = 0$$', rightId: 'r2', rightText: 'Có nghiệm kép' },
          { leftId: 'l3', leftText: '$$\\Delta < 0$$', rightId: 'r3', rightText: 'Vô nghiệm thực' },
        ],
        explanation: 'Dấu của $\\Delta$ xác định số nghiệm thực của phương trình bậc hai.',
        createdBy: 'usr_instructor_01',
      },
    },
  ];

  for (const item of initialQuestions) {
    const { revision, ...questionData } = item;
    await db
      .insert(questions)
      .values(questionData)
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          code: questionData.code,
          type: questionData.type,
          difficulty: questionData.difficulty,
          defaultPoints: questionData.defaultPoints,
          currentRevisionId: questionData.currentRevisionId,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(questionRevisions)
      .values(revision)
      .onConflictDoUpdate({
        target: [questionRevisions.questionId, questionRevisions.revisionNumber],
        set: {
          prompt: revision.prompt,
          options: revision.options,
          pairs: revision.pairs,
          explanation: revision.explanation,
        },
      });
  }

  console.log(`✅ [question_db] Seed completed: ${initialQuestions.length} questions seeded.`);
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  if (isQuestionDbConfigured()) {
    seedQuestionDatabase()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Skipping Question DB seed: QUESTION_DATABASE_URL not configured.');
  }
}
