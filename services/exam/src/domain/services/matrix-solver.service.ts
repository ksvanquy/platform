import type {
  QuestionDTO,
  BlueprintCriterion,
  ScoringPolicyConfig,
  FrozenQuestionItem,
  ExamMasterPayload,
  ExamPermutationMapping,
} from '@platform/contracts';
import { DeterministicPRNG } from './prng.service.js';
import { ExamSnapshot } from '../entities/exam.entity.js';
import { ExamMatrixResolutionError } from '../errors/exam-domain.errors.js';
import { PermutationHydrator } from './permutation-hydrator.service.js';

export interface MatrixSolverInput {
  examId: string;
  examCode: string;
  examTitle: string;
  durationMinutes: number;
  seedBase: number;
  variantsCount: number;
  criteria: BlueprintCriterion[];
  scoringPolicy: ScoringPolicyConfig;
  availableQuestions: QuestionDTO[];
}

export interface ResolvedMatrixResult {
  masterPayload: ExamMasterPayload;
  snapshots: ExamSnapshot[];
  totalQuestions: number;
  totalPoints: number;
}

export class MatrixSolverService {
  /**
   * Solves the specification matrix against the question pool and generates frozen variants with sanitized manifests.
   */
  static solveMatrix(input: MatrixSolverInput): ResolvedMatrixResult {
    const {
      examId,
      examTitle,
      durationMinutes,
      seedBase,
      variantsCount,
      criteria,
      scoringPolicy,
      availableQuestions,
    } = input;

    const basePRNG = new DeterministicPRNG(seedBase);
    const selectedQuestionItems: Array<{ question: QuestionDTO; points: number }> = [];

    // Filter active questions
    const activePool = availableQuestions.filter(
      (q) => q.status === 'ACTIVE' || !q.status
    );

    if (criteria && criteria.length > 0) {
      // Resolve each criterion
      for (const criterion of criteria) {
        let matching = activePool.filter((q) => {
          let matchesTopic = true;
          let matchesDifficulty = true;

          if (criterion.topicNodeId) {
            matchesTopic = q.topicNodeId === criterion.topicNodeId;
          }
          if (criterion.difficulty) {
            matchesDifficulty = q.difficulty === criterion.difficulty;
          }

          return matchesTopic && matchesDifficulty;
        });

        // Ensure questions haven't already been selected in a previous criterion
        const alreadySelectedIds = new Set(selectedQuestionItems.map((item) => item.question.id));
        matching = matching.filter((q) => !alreadySelectedIds.has(q.id));

        if (matching.length < criterion.questionCount) {
          throw new ExamMatrixResolutionError(
            `Insufficient questions in Item Bank for criteria (Topic: ${criterion.topicNodeId || 'ANY'}, ` +
            `Difficulty: ${criterion.difficulty || 'ANY'}). Required: ${criterion.questionCount}, Available: ${matching.length}`
          );
        }

        // Deterministically select questions from matching pool
        const shuffledMatching = basePRNG.shuffle(matching);
        const chosen = shuffledMatching.slice(0, criterion.questionCount);

        for (const q of chosen) {
          selectedQuestionItems.push({
            question: q,
            points: criterion.pointsPerQuestion || q.defaultPoints || 1,
          });
        }
      }
    } else {
      // If no matrix criteria specified, use available questions up to default pool
      if (activePool.length === 0) {
        throw new ExamMatrixResolutionError('No active questions available to generate exam.');
      }
      for (const q of activePool) {
        selectedQuestionItems.push({
          question: q,
          points: q.defaultPoints || 1,
        });
      }
    }

    if (selectedQuestionItems.length === 0) {
      throw new ExamMatrixResolutionError('Matrix solver resolved 0 questions for this exam.');
    }

    const totalQuestions = selectedQuestionItems.length;
    const totalPoints = selectedQuestionItems.reduce((sum, item) => sum + item.points, 0);

    // 1. Build Master Question Items & Master Payload (single source of truth for the exam)
    const masterQuestions: FrozenQuestionItem[] = selectedQuestionItems.map(({ question, points }) => {
      const rev = question.currentRevision;
      const prompt = rev?.prompt || `Question ${question.code}`;
      const rawOptions = rev?.options || [];
      return {
        id: question.id,
        revisionId: question.currentRevisionId || rev?.id || `rev_${question.id}`,
        type: question.type,
        prompt: prompt,
        options: rawOptions.map((opt) => ({
          id: opt.id,
          content: opt.content,
          isCorrect: Boolean(opt.isCorrect),
          explanation: opt.explanation,
        })),
        pairs: rev?.pairs,
        points: points,
        explanation: rev?.explanation,
        rubric: rev?.rubric,
      };
    });

    const masterPayload: ExamMasterPayload = {
      examId,
      examTitle,
      durationMinutes,
      totalQuestions,
      totalPoints,
      scoringPolicy,
      questions: masterQuestions,
    };

    // 2. Generate Snapshots for each requested variant using compact Permutation Mappings
    const snapshots: ExamSnapshot[] = [];
    const count = Math.max(1, variantsCount || 1);

    for (let i = 0; i < count; i++) {
      const variantCode = count === 1 ? 'DEFAULT' : String(101 + i);
      const variantSeed = (seedBase + i * 7919) | 0;
      const variantPRNG = new DeterministicPRNG(variantSeed);

      // Shuffle question order deterministically
      const variantQuestions = variantPRNG.shuffle(selectedQuestionItems);
      const questionOrder = variantQuestions.map((item) => item.question.id);
      const optionOrders: Record<string, string[]> = {};

      for (const { question } of variantQuestions) {
        const rev = question.currentRevision;
        const rawOptions = rev?.options || [];
        const shouldShuffleOptions =
          question.type === 'SINGLE' || question.type === 'MULTIPLE';
        const orderedOptions = shouldShuffleOptions
          ? variantPRNG.shuffle(rawOptions)
          : [...rawOptions];

        optionOrders[question.id] = orderedOptions.map((opt) => opt.id);
      }

      const permutationMapping: ExamPermutationMapping = {
        variantCode,
        seed: variantSeed,
        questionOrder,
        optionOrders,
      };

      // Hydrate variant snapshot deterministically using PermutationHydrator
      const { frozenPayload, sanitizedManifest, contentHash } = PermutationHydrator.hydrate(
        masterPayload,
        permutationMapping
      );

      const snapshotId = `snp_${examId}_${variantCode}`;

      snapshots.push(
        new ExamSnapshot({
          id: snapshotId,
          examId,
          variantCode,
          contentHash,
          permutationMapping,
          masterPayload,
          frozenPayload,
          sanitizedManifest,
        })
      );
    }

    return {
      masterPayload,
      snapshots,
      totalQuestions,
      totalPoints,
    };
  }
}
