import { questions, questionRevisions } from './schema.js';
import { getQuestionDb, isQuestionDbConfigured } from './connection.js';
export { isQuestionDbConfigured };

export async function seedQuestionDatabase(dbInstance?: any): Promise<void> {
  const db = dbInstance || getQuestionDb();

  console.log('🌱 [question_db] Seeding comprehensive question bank into PostgreSQL...');

  const initialQuestions = [
    // -------------------------------------------------------------------------
    // MÔN TOÁN 10 - PHƯƠNG TRÌNH BẬC HAI (node_math_quad_eq, node_grade_10)
    // -------------------------------------------------------------------------
    // 1. REMEMBER - SINGLE
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
        prompt: 'Công thức nghiệm của phương trình bậc hai $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$) khi biệt thức $$\\Delta = b^2 - 4ac > 0$$ là:',
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
    // 2. REMEMBER - SINGLE
    {
      id: 'q_math10_quad_003',
      code: 'MATH10-QUAD-003',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_003_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_003_v1',
        questionId: 'q_math10_quad_003',
        revisionNumber: 1,
        prompt: 'Biệt thức thu gọn $$\\Delta\'$$ của phương trình bậc hai $$ax^2 + 2b\'x + c = 0$$ ($$a \\neq 0$$) được tính theo công thức nào?',
        options: [
          { id: 'opt_31', content: '$$\\Delta\' = b\'^2 - ac$$', isCorrect: true, explanation: 'Công thức biệt thức thu gọn chính xác' },
          { id: 'opt_32', content: '$$\\Delta\' = b\'^2 - 4ac$$', isCorrect: false },
          { id: 'opt_33', content: '$$\\Delta\' = 2b\'^2 - ac$$', isCorrect: false },
          { id: 'opt_34', content: '$$\\Delta\' = b\'^2 + ac$$', isCorrect: false },
        ],
        explanation: 'Với $b = 2b\'$, biệt thức thu gọn là $\\Delta\' = b\'^2 - ac$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 3. REMEMBER - SINGLE
    {
      id: 'q_math10_quad_004',
      code: 'MATH10-QUAD-004',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_004_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_004_v1',
        questionId: 'q_math10_quad_004',
        revisionNumber: 1,
        prompt: 'Theo định lý Vi-ét, nếu phương trình $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$) có hai nghiệm $$x_1, x_2$$ thì tổng $$S = x_1 + x_2$$ và tích $$P = x_1 x_2$$ là:',
        options: [
          { id: 'opt_41', content: '$$S = -\\frac{b}{a}; \\quad P = \\frac{c}{a}$$', isCorrect: true },
          { id: 'opt_42', content: '$$S = \\frac{b}{a}; \\quad P = -\\frac{c}{a}$$', isCorrect: false },
          { id: 'opt_43', content: '$$S = -\\frac{b}{2a}; \\quad P = \\frac{c}{a}$$', isCorrect: false },
          { id: 'opt_44', content: '$$S = -\\frac{c}{a}; \\quad P = \\frac{b}{a}$$', isCorrect: false },
        ],
        explanation: 'Hệ thức Vi-ét: $x_1 + x_2 = -b/a$ và $x_1 x_2 = c/a$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 4. REMEMBER - SINGLE
    {
      id: 'q_math10_quad_005',
      code: 'MATH10-QUAD-005',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_005_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_005_v1',
        questionId: 'q_math10_quad_005',
        revisionNumber: 1,
        prompt: 'Điều kiện cần và đủ để phương trình bậc hai $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$) có hai nghiệm trái dấu là:',
        options: [
          { id: 'opt_51', content: '$$P = \\frac{c}{a} < 0 \\iff ac < 0$$', isCorrect: true },
          { id: 'opt_52', content: '$$\\Delta > 0$$ và $$S > 0$$', isCorrect: false },
          { id: 'opt_53', content: '$$ac > 0$$ và $$b < 0$$', isCorrect: false },
          { id: 'opt_54', content: '$$\\Delta = 0$$', isCorrect: false },
        ],
        explanation: 'Hai nghiệm trái dấu khi tích $x_1 x_2 = c/a < 0$, tương đương $ac < 0$ (khi đó $\\Delta = b^2 - 4ac > 0$ tự động thỏa mãn).',
        createdBy: 'usr_instructor_01',
      },
    },
    // 5. REMEMBER - FILL_IN
    {
      id: 'q_math10_quad_017',
      code: 'MATH10-QUAD-017',
      type: 'FILL_IN' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_017_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_017_v1',
        questionId: 'q_math10_quad_017',
        revisionNumber: 1,
        prompt: 'Điền từ thích hợp vào chỗ trống: Khi biệt thức $$\\Delta = 0$$, phương trình bậc hai $$ax^2 + bx + c = 0$$ ($$a \\neq 0$$) có một nghiệm _____ là $$x_1 = x_2 = -\\frac{b}{2a}$$.',
        options: [],
        rubric: { acceptableAnswers: ['kép', 'nghiệm kép', 'kep'] },
        explanation: 'Khi $\\Delta = 0$, phương trình có nghiệm kép $x = -b/(2a)$.',
        createdBy: 'usr_instructor_01',
      },
    },

    // 6. UNDERSTAND - SINGLE
    {
      id: 'q_math10_quad_006',
      code: 'MATH10-QUAD-006',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_006_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_006_v1',
        questionId: 'q_math10_quad_006',
        revisionNumber: 1,
        prompt: 'Cho phương trình $$x^2 - 5x + 6 = 0$$. Tổng và tích hai nghiệm của phương trình lần lượt là:',
        options: [
          { id: 'opt_61', content: '$$S = 5; \\quad P = 6$$', isCorrect: true },
          { id: 'opt_62', content: '$$S = -5; \\quad P = 6$$', isCorrect: false },
          { id: 'opt_63', content: '$$S = 6; \\quad P = 5$$', isCorrect: false },
          { id: 'opt_64', content: '$$S = -5; \\quad P = -6$$', isCorrect: false },
        ],
        explanation: 'Ta có $a = 1, b = -5, c = 6$. Tổng $S = -(-5)/1 = 5$, tích $P = 6/1 = 6$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 7. UNDERSTAND - MULTIPLE
    {
      id: 'q_math10_quad_007',
      code: 'MATH10-QUAD-007',
      type: 'MULTIPLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_007_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_007_v1',
        questionId: 'q_math10_quad_007',
        revisionNumber: 1,
        prompt: 'Những phương trình nào dưới đây có biệt thức $$\\Delta > 0$$ (có hai nghiệm phân biệt)?',
        options: [
          { id: 'opt_71', content: '$$x^2 - 3x + 2 = 0$$', isCorrect: true, explanation: '$\\Delta = 9 - 8 = 1 > 0$' },
          { id: 'opt_72', content: '$$x^2 - 4x + 4 = 0$$', isCorrect: false, explanation: 'Nghiệm kép $\\Delta = 0$' },
          { id: 'opt_73', content: '$$x^2 + x - 6 = 0$$', isCorrect: true, explanation: '$\\Delta = 1 - (-24) = 25 > 0$' },
          { id: 'opt_74', content: '$$x^2 + 2x + 5 = 0$$', isCorrect: false, explanation: 'Vô nghiệm $\\Delta = 4 - 20 = -16 < 0$' },
        ],
        explanation: 'Các phương trình có $\\Delta > 0$ là $x^2 - 3x + 2 = 0$ và $x^2 + x - 6 = 0$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 8. UNDERSTAND - SINGLE
    {
      id: 'q_math10_quad_008',
      code: 'MATH10-QUAD-008',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_008_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_008_v1',
        questionId: 'q_math10_quad_008',
        revisionNumber: 1,
        prompt: 'Tọa độ đỉnh $$I$$ của parabol hàm số bậc hai $$y = ax^2 + bx + c$$ ($$a \\neq 0$$) được xác định bởi công thức:',
        options: [
          { id: 'opt_81', content: '$$I\\left(-\\frac{b}{2a}; -\\frac{\\Delta}{4a}\\right)$$', isCorrect: true },
          { id: 'opt_82', content: '$$I\\left(\\frac{b}{2a}; \\frac{\\Delta}{4a}\\right)$$', isCorrect: false },
          { id: 'opt_83', content: '$$I\\left(-\\frac{b}{a}; -\\frac{\\Delta}{2a}\\right)$$', isCorrect: false },
          { id: 'opt_84', content: '$$I\\left(-\\frac{b}{2a}; -\\frac{c}{a}\\right)$$', isCorrect: false },
        ],
        explanation: 'Đỉnh của parabol $y = ax^2 + bx + c$ có hoành độ $x_I = -\\frac{b}{2a}$ và tung độ $y_I = -\\frac{\\Delta}{4a}$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 9. UNDERSTAND - SINGLE
    {
      id: 'q_math10_quad_009',
      code: 'MATH10-QUAD-009',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_009_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_009_v1',
        questionId: 'q_math10_quad_009',
        revisionNumber: 1,
        prompt: 'Trục đối xứng của đồ thị hàm số $$y = 2x^2 - 4x + 1$$ là đường thẳng nào?',
        options: [
          { id: 'opt_91', content: '$$x = 1$$', isCorrect: true },
          { id: 'opt_92', content: '$$x = -1$$', isCorrect: false },
          { id: 'opt_93', content: '$$x = 2$$', isCorrect: false },
          { id: 'opt_94', content: '$$y = 1$$', isCorrect: false },
        ],
        explanation: 'Trục đối xứng $x = -b/(2a) = -(-4)/(2 \\cdot 2) = 1$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 10. UNDERSTAND - MATCHING
    {
      id: 'q_math10_quad_018',
      code: 'MATH10-QUAD-018',
      type: 'MATCHING' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_018_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_018_v1',
        questionId: 'q_math10_quad_018',
        revisionNumber: 1,
        prompt: 'Hãy ghép mỗi phương trình bậc hai với số lượng nghiệm thực tương ứng:',
        options: [],
        pairs: [
          { leftId: 'l1', leftText: '$$x^2 - 4x + 4 = 0$$', rightId: 'r1', rightText: '1 nghiệm kép ($$x = 2$$)' },
          { leftId: 'l2', leftText: '$$x^2 + 2x + 5 = 0$$', rightId: 'r2', rightText: '0 nghiệm thực (vô nghiệm)' },
          { leftId: 'l3', leftText: '$$x^2 - 5x + 6 = 0$$', rightId: 'r3', rightText: '2 nghiệm phân biệt ($$x = 2; 3$$)' },
        ],
        explanation: 'Xét $\\Delta$ của từng phương trình để xác định số nghiệm.',
        createdBy: 'usr_instructor_01',
      },
    },

    // 11. APPLY - SINGLE
    {
      id: 'q_math10_quad_002',
      code: 'MATH10-QUAD-002',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_002_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_002_v1',
        questionId: 'q_math10_quad_002',
        revisionNumber: 1,
        prompt: 'Tìm tập nghiệm của phương trình $$2x^2 - 5x + 2 = 0$$:',
        options: [
          { id: 'opt_21', content: '$$S = \\left\\{2; \\frac{1}{2}\\right\\}$$', isCorrect: true, explanation: 'Ta có $\\Delta = 25 - 16 = 9 > 0 \\implies x_1 = 2, x_2 = 1/2$' },
          { id: 'opt_22', content: '$$S = \\left\\{-2; -\\frac{1}{2}\\right\\}$$', isCorrect: false },
          { id: 'opt_23', content: '$$S = \\{1; 2\\}$$', isCorrect: false },
          { id: 'opt_24', content: '$$S = \\emptyset$$', isCorrect: false },
        ],
        explanation: 'Biệt thức $\\Delta = (-5)^2 - 4(2)(2) = 25 - 16 = 9 = 3^2$. Các nghiệm là: $x_1 = \\frac{5 + 3}{4} = 2$, $x_2 = \\frac{5 - 3}{4} = \\frac{1}{2}$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 12. APPLY - NUMERIC
    {
      id: 'q_math10_quad_012',
      code: 'MATH10-QUAD-012',
      type: 'NUMERIC' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_012_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_012_v1',
        questionId: 'q_math10_quad_012',
        revisionNumber: 1,
        prompt: 'Cho phương trình bậc hai $$x^2 - 6x + m = 0$$. Tìm giá trị thực của tham số $$m$$ để phương trình có nghiệm kép:',
        options: [],
        rubric: { targetValue: 9, tolerance: 0.01 },
        explanation: 'Để phương trình có nghiệm kép thì $\\Delta\' = (-3)^2 - m = 0 \\iff 9 - m = 0 \\iff m = 9$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 13. APPLY - SINGLE
    {
      id: 'q_math10_quad_011',
      code: 'MATH10-QUAD-011',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_011_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_011_v1',
        questionId: 'q_math10_quad_011',
        revisionNumber: 1,
        prompt: 'Tìm tất cả giá trị thực của $$m$$ để phương trình $$x^2 - 2(m-1)x + m^2 - 4 = 0$$ có hai nghiệm phân biệt:',
        options: [
          { id: 'opt_111', content: '$$m < \\frac{5}{2}$$', isCorrect: true },
          { id: 'opt_112', content: '$$m > \\frac{5}{2}$$', isCorrect: false },
          { id: 'opt_113', content: '$$m = \\frac{5}{2}$$', isCorrect: false },
          { id: 'opt_114', content: '$$m < 3$$', isCorrect: false },
        ],
        explanation: 'Phương trình có hai nghiệm phân biệt khi $\\Delta\' = (m-1)^2 - (m^2 - 4) = m^2 - 2m + 1 - m^2 + 4 = 5 - 2m > 0 \\iff m < 5/2$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 14. APPLY - ORDERING
    {
      id: 'q_math10_quad_014',
      code: 'MATH10-QUAD-014',
      type: 'ORDERING' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_014_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_014_v1',
        questionId: 'q_math10_quad_014',
        revisionNumber: 1,
        prompt: 'Sắp xếp các bước giải phương trình trùng phương $$x^4 - 5x^2 + 4 = 0$$ theo thứ tự chuẩn xác:',
        options: [
          { id: 'step_1', content: 'Đặt ẩn phụ $$t = x^2$$ với điều kiện $$t \\ge 0$$' },
          { id: 'step_2', content: 'Đưa về phương trình bậc hai: $$t^2 - 5t + 4 = 0$$' },
          { id: 'step_3', content: 'Giải phương trình tìm $$t_1 = 1$$ (nhận) và $$t_2 = 4$$ (nhận)' },
          { id: 'step_4', content: 'Thay trở lại tìm $$x = \\pm 1$$ và $$x = \\pm 2$$, kết luận tập nghiệm' },
        ],
        rubric: { correctOrder: ['step_1', 'step_2', 'step_3', 'step_4'] },
        explanation: 'Thứ tự chuẩn: Đặt ẩn phụ có điều kiện -> Lập phương trình theo t -> Giải tìm t đối chiếu điều kiện -> Tìm x và kết luận.',
        createdBy: 'usr_instructor_01',
      },
    },

    // 15. ANALYZE - SINGLE
    {
      id: 'q_math10_quad_015',
      code: 'MATH10-QUAD-015',
      type: 'SINGLE' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'ANALYZE' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_quad_015_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_quad_015_v1',
        questionId: 'q_math10_quad_015',
        revisionNumber: 1,
        prompt: 'Tìm tất cả các giá trị thực của tham số $$m$$ để tam thức bậc hai $$f(x) = x^2 - 2mx + m + 2 > 0$$ nghiệm đúng với mọi $$x \\in \\mathbb{R}$$.',
        options: [
          { id: 'opt_151', content: '$$-1 < m < 2$$', isCorrect: true },
          { id: 'opt_152', content: '$$m < -1$$ hoặc $$m > 2$$', isCorrect: false },
          { id: 'opt_153', content: '$$-2 < m < 1$$', isCorrect: false },
          { id: 'opt_154', content: '$$m \\in \\mathbb{R}$$', isCorrect: false },
        ],
        explanation: 'Tam thức có $a = 1 > 0$. Để $f(x) > 0, \\forall x \\in \\mathbb{R}$ thì $\\Delta\' = m^2 - (m+2) < 0 \\iff m^2 - m - 2 < 0 \\iff -1 < m < 2$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 16. ANALYZE - MATCHING
    {
      id: 'q_math10_match_001',
      code: 'MATH10-MATCH-001',
      type: 'MATCHING' as const,
      topicNodeId: 'node_math_quad_eq',
      gradeNodeId: 'node_grade_10',
      difficulty: 'ANALYZE' as const,
      defaultPoints: 1,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_math10_match_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_math10_match_001_v1',
        questionId: 'q_math10_match_001',
        revisionNumber: 1,
        prompt: 'Nối điều kiện của biệt thức $$\\Delta$$ và hệ số $$a$$ với tính chất dấu của tam thức bậc hai $$f(x) = ax^2 + bx + c$$ ($$a \\neq 0$$):',
        options: [],
        pairs: [
          { leftId: 'l1', leftText: '$$a > 0$$ và $$\\Delta < 0$$', rightId: 'r1', rightText: '$$f(x) > 0, \\forall x \\in \\mathbb{R}$$' },
          { leftId: 'l2', leftText: '$$a < 0$$ và $$\\Delta < 0$$', rightId: 'r2', rightText: '$$f(x) < 0, \\forall x \\in \\mathbb{R}$$' },
          { leftId: 'l3', leftText: '$$a > 0$$ và $$\\Delta = 0$$', rightId: 'r3', rightText: '$$f(x) \\ge 0, \\forall x \\in \\mathbb{R}$$, triệt tiêu tại $$x = -b/(2a)$$' },
        ],
        explanation: 'Định lý về dấu của tam thức bậc hai phụ thuộc vào dấu của $a$ và biệt thức $\\Delta$.',
        createdBy: 'usr_instructor_01',
      },
    },

    // -------------------------------------------------------------------------
    // MÔN CƠ SỞ DỮ LIỆU & SQL (node_topic_it_db, node_grade_10)
    // -------------------------------------------------------------------------
    // 17. REMEMBER - SINGLE
    {
      id: 'q_it_sql_001',
      code: 'IT-SQL-001',
      type: 'SINGLE' as const,
      topicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_it_sql_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_it_sql_001_v1',
        questionId: 'q_it_sql_001',
        revisionNumber: 1,
        prompt: 'Trong ngôn ngữ SQL chuẩn, mệnh đề nào sau đây được sử dụng để lọc các bản ghi theo điều kiện lọc cụ thể?',
        options: [
          { id: 'opt_s1', content: 'WHERE', isCorrect: true, explanation: 'WHERE dùng để chỉ định điều kiện lọc hàng' },
          { id: 'opt_s2', content: 'ORDER BY', isCorrect: false },
          { id: 'opt_s3', content: 'GROUP BY', isCorrect: false },
          { id: 'opt_s4', content: 'LIMIT', isCorrect: false },
        ],
        explanation: 'Mệnh đề WHERE được dùng để lọc dữ liệu theo điều kiện logic trong câu lệnh SELECT, UPDATE hoặc DELETE.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 18. UNDERSTAND - MULTIPLE
    {
      id: 'q_it_sql_002',
      code: 'IT-SQL-002',
      type: 'MULTIPLE' as const,
      topicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_it_sql_002_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_it_sql_002_v1',
        questionId: 'q_it_sql_002',
        revisionNumber: 1,
        prompt: 'Những mệnh đề nào sau đây là hợp lệ và có thể xuất hiện trong một câu truy vấn SELECT SQL tiêu chuẩn?',
        options: [
          { id: 'opt_m1', content: 'GROUP BY', isCorrect: true },
          { id: 'opt_m2', content: 'HAVING', isCorrect: true },
          { id: 'opt_m3', content: 'ORDER BY', isCorrect: true },
          { id: 'opt_m4', content: 'PARTITION TABLE ONLY', isCorrect: false },
        ],
        explanation: 'Các mệnh đề chuẩn trong SELECT gồm: SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 19. UNDERSTAND - ORDERING
    {
      id: 'q_it_sql_003',
      code: 'IT-SQL-003',
      type: 'ORDERING' as const,
      topicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_it_sql_003_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_it_sql_003_v1',
        questionId: 'q_it_sql_003',
        revisionNumber: 1,
        prompt: 'Sắp xếp thứ tự thực thi logic (Logical Query Processing Order) của các mệnh đề sau trong hệ quản trị cơ sở dữ liệu quan hệ SQL:',
        options: [
          { id: 'sql_from', content: '1. FROM & JOIN (Xác định nguồn bảng)' },
          { id: 'sql_where', content: '2. WHERE (Lọc dòng dữ liệu)' },
          { id: 'sql_group', content: '3. GROUP BY (Gom nhóm các bản ghi)' },
          { id: 'sql_having', content: '4. HAVING (Lọc nhóm tổng hợp)' },
          { id: 'sql_select', content: '5. SELECT (Chiếu các cột cần lấy)' },
          { id: 'sql_order', content: '6. ORDER BY (Sắp xếp kết quả cuối)' },
        ],
        rubric: { correctOrder: ['sql_from', 'sql_where', 'sql_group', 'sql_having', 'sql_select', 'sql_order'] },
        explanation: 'Thứ tự logic của SQL Engine: FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 20. APPLY - NUMERIC
    {
      id: 'q_it_sql_004',
      code: 'IT-SQL-004',
      type: 'NUMERIC' as const,
      topicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_it_sql_004_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_it_sql_004_v1',
        questionId: 'q_it_sql_004',
        revisionNumber: 1,
        prompt: 'Bảng A có 10 dòng dữ liệu, bảng B có 5 dòng dữ liệu. Khi thực hiện truy vấn tích Descartes `SELECT * FROM A CROSS JOIN B;`, kết quả trả về bao nhiêu dòng dữ liệu?',
        options: [],
        rubric: { targetValue: 50, tolerance: 0 },
        explanation: 'Tích Descartes giữa hai quan hệ có số dòng bằng tích số dòng của hai bảng: $10 \\times 5 = 50$.',
        createdBy: 'usr_instructor_01',
      },
    },
    // 21. APPLY - SINGLE
    {
      id: 'q_it_sql_005',
      code: 'IT-SQL-005',
      type: 'SINGLE' as const,
      topicNodeId: 'node_topic_it_db',
      gradeNodeId: 'node_grade_10',
      difficulty: 'APPLY' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_it_sql_005_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_it_sql_005_v1',
        questionId: 'q_it_sql_005',
        revisionNumber: 1,
        prompt: 'Trong thiết kế cơ sở dữ liệu quan hệ, một bảng đạt dạng chuẩn thứ nhất (1NF - First Normal Form) khi thỏa mãn điều kiện cơ bản nào sau đây?',
        options: [
          { id: 'opt_1nf_1', content: 'Tất cả các giá trị trong các cột phải là giá trị nguyên tố (Atomic values), không chứa tập hợp hay mảng', isCorrect: true },
          { id: 'opt_1nf_2', content: 'Bảng phải có ít nhất 2 khóa ngoại tham chiếu đến bảng cha', isCorrect: false },
          { id: 'opt_1nf_3', content: 'Mọi phụ thuộc hàm bắc cầu đều đã được loại bỏ hoàn toàn', isCorrect: false },
          { id: 'opt_1nf_4', content: 'Tất cả các cột đều phải có kiểu dữ liệu chuỗi VARCHAR', isCorrect: false },
        ],
        explanation: 'Dạng chuẩn 1NF đòi hỏi các thuộc tính phải mang giá trị nguyên tử (atomic), không phân chia được nữa và không có nhóm lặp.',
        createdBy: 'usr_instructor_01',
      },
    },

    // -------------------------------------------------------------------------
    // MÔN TIẾNG ANH (node_topic_lang_en, node_grade_10)
    // -------------------------------------------------------------------------
    // 22. REMEMBER - SINGLE
    {
      id: 'q_eng_001',
      code: 'ENG-GRAM-001',
      type: 'SINGLE' as const,
      topicNodeId: 'node_topic_lang_en',
      gradeNodeId: 'node_grade_10',
      difficulty: 'REMEMBER' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_eng_001_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_eng_001_v1',
        questionId: 'q_eng_001',
        revisionNumber: 1,
        prompt: 'What is the past participle form (V3) of the irregular verb "write"?',
        options: [
          { id: 'opt_e1', content: 'written', isCorrect: true },
          { id: 'opt_e2', content: 'wrote', isCorrect: false },
          { id: 'opt_e3', content: 'writed', isCorrect: false },
          { id: 'opt_e4', content: 'writing', isCorrect: false },
        ],
        explanation: 'The verb forms of "write" are: write (base) - wrote (past) - written (past participle).',
        createdBy: 'usr_instructor_01',
      },
    },
    // 23. UNDERSTAND - SINGLE
    {
      id: 'q_eng_002',
      code: 'ENG-GRAM-002',
      type: 'SINGLE' as const,
      topicNodeId: 'node_topic_lang_en',
      gradeNodeId: 'node_grade_10',
      difficulty: 'UNDERSTAND' as const,
      defaultPoints: 2,
      status: 'ACTIVE' as const,
      currentRevisionId: 'qrev_eng_002_v1',
      ownerId: 'usr_instructor_01',
      revision: {
        id: 'qrev_eng_002_v1',
        questionId: 'q_eng_002',
        revisionNumber: 1,
        prompt: 'Complete the Second Conditional sentence: "If she _____ harder, she would pass the final examination with honors."',
        options: [
          { id: 'opt_e21', content: 'studied', isCorrect: true },
          { id: 'opt_e22', content: 'studies', isCorrect: false },
          { id: 'opt_e23', content: 'will study', isCorrect: false },
          { id: 'opt_e24', content: 'has studied', isCorrect: false },
        ],
        explanation: 'Second conditional structure: If + past simple, would + V(infinitive).',
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
          topicNodeId: questionData.topicNodeId,
          gradeNodeId: questionData.gradeNodeId,
          difficulty: questionData.difficulty,
          defaultPoints: questionData.defaultPoints,
          status: questionData.status,
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
          rubric: revision.rubric,
        },
      });
  }

  console.log(`✅ [question_db] Seed completed: ${initialQuestions.length} standardized questions seeded across Bloom categories.`);
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
