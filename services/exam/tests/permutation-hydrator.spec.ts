import { describe, it, expect } from 'vitest';
import { PermutationHydrator } from '../src/domain/services/permutation-hydrator.service.js';
import { MatrixSolverService } from '../src/domain/services/matrix-solver.service.js';
import { ExamSnapshot } from '../src/domain/entities/exam.entity.js';
import type {
  ExamMasterPayload,
  ExamPermutationMapping,
  QuestionDTO,
  BlueprintCriterion,
  ScoringPolicyConfig,
} from '@platform/contracts';

describe('Exam Snapshot Permutation Mapping & PermutationHydrator', () => {
  const scoringPolicy: ScoringPolicyConfig = {
    strategyType: 'STANDARD',
    roundingDecimal: 2,
  };

  const sampleQuestions: QuestionDTO[] = Array.from({ length: 10 }, (_, i) => ({
    id: `q_${i + 1}`,
    code: `TOAN10_${String(i + 1).padStart(2, '0')}`,
    type: 'SINGLE',
    topicNodeId: 'TOPIC_ALGEBRA',
    difficulty: 'REMEMBER',
    status: 'ACTIVE',
    defaultPoints: 1,
    currentRevision: {
      id: `rev_${i + 1}`,
      questionId: `q_${i + 1}`,
      revisionNumber: 1,
      prompt: `Question prompt for question ${i + 1} with academic context and description`,
      options: [
        { id: `opt_${i + 1}_a`, content: `Option A for Q${i + 1}`, isCorrect: true, explanation: 'Detailed explanation for correct option A' },
        { id: `opt_${i + 1}_b`, content: `Option B for Q${i + 1}`, isCorrect: false, explanation: 'Detailed explanation why B is incorrect' },
        { id: `opt_${i + 1}_c`, content: `Option C for Q${i + 1}`, isCorrect: false, explanation: 'Detailed explanation why C is incorrect' },
        { id: `opt_${i + 1}_d`, content: `Option D for Q${i + 1}`, isCorrect: false, explanation: 'Detailed explanation why D is incorrect' },
      ],
      createdAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  it('should generate deterministic permutation mapping and hydrate identical payload', () => {
    const criteria: BlueprintCriterion[] = [
      {
        topicNodeId: 'TOPIC_ALGEBRA',
        difficulty: 'REMEMBER',
        questionCount: 5,
        pointsPerQuestion: 2,
      },
    ];

    const result = MatrixSolverService.solveMatrix({
      examId: 'exm_perm_01',
      examCode: 'EXM_PERM_01',
      examTitle: 'Kiểm Tra Hoán Vị Đề Thi',
      durationMinutes: 45,
      seedBase: 4242,
      variantsCount: 3,
      criteria,
      scoringPolicy,
      availableQuestions: sampleQuestions,
    });

    expect(result.snapshots).toHaveLength(3);
    expect(result.masterPayload).toBeDefined();
    expect(result.masterPayload.questions).toHaveLength(5);

    const snap1 = result.snapshots[0];
    const snap2 = result.snapshots[1];

    // Verify permutation mappings are attached
    expect(snap1.permutationMapping).toBeDefined();
    expect(snap1.permutationMapping?.questionOrder).toHaveLength(5);
    expect(Object.keys(snap1.permutationMapping?.optionOrders || {})).toHaveLength(5);

    // Verify determinism: re-hydrating with the same permutationMapping yields exact same contentHash
    const rehydrated = PermutationHydrator.hydrate(result.masterPayload, snap1.permutationMapping!, snap1.createdAt.getTime());
    expect(rehydrated.contentHash).toBe(snap1.contentHash);
    expect(rehydrated.frozenPayload.questions).toEqual(snap1.frozenPayload.questions);
    expect(rehydrated.sanitizedManifest.questions).toEqual(snap1.sanitizedManifest.questions);

    // Verify distinct variants have distinct permutation orders and hashes
    expect(snap1.contentHash).not.toBe(snap2.contentHash);
  });

  it('should drastically reduce DB payload size by storing permutation mapping instead of full cloned payloads', () => {
    const criteria: BlueprintCriterion[] = [
      {
        topicNodeId: 'TOPIC_ALGEBRA',
        difficulty: 'REMEMBER',
        questionCount: 10,
        pointsPerQuestion: 1,
      },
    ];

    const result = MatrixSolverService.solveMatrix({
      examId: 'exm_size_test',
      examCode: 'EXM_SIZE_TEST',
      examTitle: 'Payload Size Comparison Exam',
      durationMinutes: 60,
      seedBase: 9999,
      variantsCount: 4,
      criteria,
      scoringPolicy,
      availableQuestions: sampleQuestions,
    });

    for (const snap of result.snapshots) {
      const fullCloneJson = JSON.stringify({
        frozenPayload: snap.frozenPayload,
        sanitizedManifest: snap.sanitizedManifest,
      });

      const permutationMappingJson = JSON.stringify(snap.permutationMapping);

      const fullSizeBytes = Buffer.byteLength(fullCloneJson, 'utf8');
      const permutationSizeBytes = Buffer.byteLength(permutationMappingJson, 'utf8');

      // Permutation mapping should be a fraction of the full cloned JSON size (> 75% reduction even for small prompts)
      const reductionPercentage = ((fullSizeBytes - permutationSizeBytes) / fullSizeBytes) * 100;
      expect(reductionPercentage).toBeGreaterThan(70);
      expect(permutationSizeBytes).toBeLessThan(fullSizeBytes / 3);
    }
  });

  it('should lazy-hydrate snapshot from masterPayload and permutationMapping when frozenPayload is not preloaded', () => {
    const master: ExamMasterPayload = {
      examId: 'exm_lazy_01',
      examTitle: 'Lazy Hydration Exam',
      durationMinutes: 30,
      totalQuestions: 2,
      totalPoints: 4,
      scoringPolicy,
      questions: [
        {
          id: 'q_1',
          revisionId: 'rev_1',
          type: 'SINGLE',
          prompt: 'Solve 3x = 9',
          options: [
            { id: 'opt_1', content: 'x = 3', isCorrect: true, explanation: '9 / 3 = 3' },
            { id: 'opt_2', content: 'x = 2', isCorrect: false },
          ],
          points: 2,
        },
        {
          id: 'q_2',
          revisionId: 'rev_2',
          type: 'SINGLE',
          prompt: 'Solve 4 + x = 10',
          options: [
            { id: 'opt_a', content: 'x = 6', isCorrect: true },
            { id: 'opt_b', content: 'x = 5', isCorrect: false },
          ],
          points: 2,
        },
      ],
    };

    const permutation: ExamPermutationMapping = {
      variantCode: '101',
      seed: 1234,
      questionOrder: ['q_2', 'q_1'],
      optionOrders: {
        q_1: ['opt_2', 'opt_1'],
        q_2: ['opt_b', 'opt_a'],
      },
    };

    // Pre-calculate expected hash
    const expected = PermutationHydrator.hydrate(master, permutation);

    // Create snapshot with ONLY permutationMapping (frozenPayload and sanitizedManifest are null, simulating lightweight DB row)
    const snapshot = new ExamSnapshot({
      id: 'snp_exm_lazy_01_101',
      examId: 'exm_lazy_01',
      variantCode: '101',
      contentHash: expected.contentHash,
      permutationMapping: permutation,
      masterPayload: master,
    });

    // Accessing frozenPayload triggers lazy reconstitution
    expect(snapshot.frozenPayload.questions).toHaveLength(2);
    expect(snapshot.frozenPayload.questions[0].id).toBe('q_2');
    expect(snapshot.frozenPayload.questions[1].id).toBe('q_1');

    // Accessing sanitizedManifest produces sanitized items without leaking answers
    expect(snapshot.sanitizedManifest.questions).toHaveLength(2);
    expect((snapshot.sanitizedManifest.questions[0].options[0] as any).isCorrect).toBeUndefined();

    // DTO serialization works seamlessly
    const dto = snapshot.toDTO();
    expect(dto.contentHash).toBe(expected.contentHash);
    expect(dto.permutationMapping?.variantCode).toBe('101');
  });
});
