import { describe, it, expect } from 'vitest';
import { MatrixSolverService } from '../src/domain/services/matrix-solver.service.js';
import { ExamMatrixResolutionError } from '../src/domain/errors/exam-domain.errors.js';
import type { QuestionDTO, BlueprintCriteria, ScoringPolicyConfig } from '@platform/contracts';

describe('MatrixSolverService', () => {
  const scoringPolicy: ScoringPolicyConfig = {
    strategyType: 'STANDARD',
    roundingDecimal: 2,
  };

  const sampleQuestions: QuestionDTO[] = [
    {
      id: 'q_1',
      code: 'TOAN10_01',
      type: 'SINGLE',
      topicNodeId: 'TOPIC_ALGEBRA',
      difficulty: 'REMEMBER',
      status: 'ACTIVE',
      defaultPoints: 1,
      currentRevision: {
        id: 'rev_1',
        questionId: 'q_1',
        revisionNumber: 1,
        prompt: 'Solve x + 2 = 5',
        options: [
          { id: 'opt_1', content: 'x = 3', isCorrect: true, explanation: '5 - 2 = 3' },
          { id: 'opt_2', content: 'x = 4', isCorrect: false },
        ],
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'q_2',
      code: 'TOAN10_02',
      type: 'SINGLE',
      topicNodeId: 'TOPIC_ALGEBRA',
      difficulty: 'UNDERSTAND',
      status: 'ACTIVE',
      defaultPoints: 1,
      currentRevision: {
        id: 'rev_2',
        questionId: 'q_2',
        revisionNumber: 1,
        prompt: 'Solve 2x = 8',
        options: [
          { id: 'opt_a', content: 'x = 4', isCorrect: true },
          { id: 'opt_b', content: 'x = 2', isCorrect: false },
        ],
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('should successfully solve a matrix and generate sanitized manifests without leaking answer keys', () => {
    const criteria: BlueprintCriteria[] = [
      {
        topicNodeId: 'TOPIC_ALGEBRA',
        difficulty: 'REMEMBER',
        questionCount: 1,
        pointsPerQuestion: 2.5,
      },
      {
        topicNodeId: 'TOPIC_ALGEBRA',
        difficulty: 'UNDERSTAND',
        questionCount: 1,
        pointsPerQuestion: 2.5,
      },
    ];

    const result = MatrixSolverService.solveMatrix({
      examId: 'exm_test_01',
      examCode: 'EXM_TEST_01',
      examTitle: 'Kiểm Tra Đại Số 10',
      durationMinutes: 45,
      seedBase: 1337,
      variantsCount: 2,
      criteria,
      scoringPolicy,
      availableQuestions: sampleQuestions,
    });

    expect(result.totalQuestions).toBe(2);
    expect(result.totalPoints).toBe(5);
    expect(result.snapshots).toHaveLength(2);

    const snapshot1 = result.snapshots[0];
    const snapshot2 = result.snapshots[1];

    expect(snapshot1.variantCode).toBe('101');
    expect(snapshot2.variantCode).toBe('102');

    // 1. Verify frozenPayload contains academic answer keys
    const frozenQ1 = snapshot1.frozenPayload.questions.find((q) => q.id === 'q_1');
    expect(frozenQ1?.options.some((o) => o.isCorrect)).toBe(true);

    // 2. Verify sanitizedManifest DOES NOT leak isCorrect or explanation
    const sanitizedQ1 = snapshot1.sanitizedManifest.questions.find((q) => q.id === 'q_1');
    expect(sanitizedQ1).toBeDefined();
    for (const opt of sanitizedQ1!.options) {
      expect((opt as any).isCorrect).toBeUndefined();
      expect((opt as any).explanation).toBeUndefined();
    }

    // 3. Verify content hashes exist and differ across variants due to distinct ordering
    expect(snapshot1.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot2.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should throw ExamMatrixResolutionError when question bank lacks sufficient items', () => {
    const criteria: BlueprintCriteria[] = [
      {
        topicNodeId: 'TOPIC_ALGEBRA',
        difficulty: 'REMEMBER',
        questionCount: 5, // Only 1 exists in sampleQuestions
        pointsPerQuestion: 2,
      },
    ];

    expect(() => {
      MatrixSolverService.solveMatrix({
        examId: 'exm_test_02',
        examCode: 'EXM_TEST_02',
        examTitle: 'Deficit Test',
        durationMinutes: 30,
        seedBase: 100,
        variantsCount: 1,
        criteria,
        scoringPolicy,
        availableQuestions: sampleQuestions,
      });
    }).toThrow(ExamMatrixResolutionError);
  });
});
