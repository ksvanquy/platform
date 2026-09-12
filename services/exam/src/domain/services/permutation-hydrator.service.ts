import type {
  ExamMasterPayload,
  ExamPermutationMapping,
  FrozenQuestionItem,
  SanitizedExamManifest,
  SanitizedQuestionItem,
} from '@platform/contracts';
import { DeterministicPRNG } from './prng.service.js';

export interface HydratedSnapshotResult {
  frozenPayload: {
    questions: FrozenQuestionItem[];
    scoringPolicy: ExamMasterPayload['scoringPolicy'];
  };
  sanitizedManifest: SanitizedExamManifest;
  contentHash: string;
}

export class PermutationHydrator {
  /**
   * Generates a compact permutation mapping for a variant based on a deterministic PRNG seed.
   * This mapping stores only the order of question IDs and option IDs rather than cloning full payloads.
   */
  static generatePermutationMapping(
    baseQuestions: Array<{ id: string; type: string; options: Array<{ id: string }> }>,
    seed: number,
    variantCode: string
  ): ExamPermutationMapping {
    const prng = new DeterministicPRNG(seed);
    const shuffledQuestions = prng.shuffle(baseQuestions);

    const questionOrder: string[] = [];
    const optionOrders: Record<string, string[]> = {};

    for (const q of shuffledQuestions) {
      questionOrder.push(q.id);

      const shouldShuffleOptions = q.type === 'SINGLE' || q.type === 'MULTIPLE';
      const rawOptions = q.options || [];
      const orderedOptions = shouldShuffleOptions ? prng.shuffle(rawOptions) : [...rawOptions];

      optionOrders[q.id] = orderedOptions.map((opt) => opt.id);
    }

    return {
      variantCode,
      seed,
      questionOrder,
      optionOrders,
    };
  }

  /**
   * Reconstitutes (hydrates) full frozen payload and sanitized candidate manifest
   * from a master payload and a compact permutation mapping.
   * Ensures 100% deterministic fidelity and prevents answer leaking in sanitized manifest.
   */
  static hydrate(
    master: ExamMasterPayload,
    permutation: ExamPermutationMapping,
    serverTimestamp: number = Date.now()
  ): HydratedSnapshotResult {
    const masterMap = new Map<string, FrozenQuestionItem>();
    for (const q of master.questions) {
      masterMap.set(q.id, q);
    }

    const frozenQuestions: FrozenQuestionItem[] = [];
    const sanitizedQuestions: SanitizedQuestionItem[] = [];

    // Use question order defined in permutation
    const questionSequence = permutation.questionOrder && permutation.questionOrder.length > 0
      ? permutation.questionOrder
      : master.questions.map((q) => q.id);

    for (const qId of questionSequence) {
      const baseQ = masterMap.get(qId);
      if (!baseQ) continue;

      // Reorder options according to permutation mapping
      let orderedOptions = baseQ.options ? [...baseQ.options] : [];
      const optOrder = permutation.optionOrders?.[qId];

      if (optOrder && optOrder.length > 0) {
        const optMap = new Map(baseQ.options.map((o) => [o.id, o]));
        const reordered: typeof baseQ.options = [];
        const seenOptIds = new Set<string>();

        for (const optId of optOrder) {
          const opt = optMap.get(optId);
          if (opt) {
            reordered.push(opt);
            seenOptIds.add(optId);
          }
        }

        // Add any options that were not present in optOrder (safeguard)
        for (const opt of baseQ.options) {
          if (!seenOptIds.has(opt.id)) {
            reordered.push(opt);
          }
        }
        orderedOptions = reordered;
      }

      // 1. Frozen Question Item (Includes full answer keys & explanations)
      frozenQuestions.push({
        id: baseQ.id,
        revisionId: baseQ.revisionId,
        type: baseQ.type,
        prompt: baseQ.prompt,
        options: orderedOptions.map((opt) => ({
          id: opt.id,
          content: opt.content,
          isCorrect: Boolean(opt.isCorrect),
          explanation: opt.explanation,
        })),
        pairs: baseQ.pairs,
        points: baseQ.points,
        explanation: baseQ.explanation,
        rubric: baseQ.rubric,
      });

      // 2. Sanitized Question Item (STRIPPED of isCorrect & explanation)
      sanitizedQuestions.push({
        id: baseQ.id,
        type: baseQ.type,
        prompt: baseQ.prompt,
        options: orderedOptions.map((opt) => ({
          id: opt.id,
          content: opt.content,
        })),
        pairs: baseQ.pairs?.map((p: any) => ({
          leftId: p.leftId,
          leftText: p.leftText,
          rightId: p.rightId,
          rightText: p.rightText,
        })),
        points: baseQ.points,
      });
    }

    const frozenPayload = {
      questions: frozenQuestions,
      scoringPolicy: master.scoringPolicy,
    };

    const sanitizedManifest: SanitizedExamManifest = {
      examId: master.examId,
      variantCode: permutation.variantCode,
      title: master.examTitle,
      durationMinutes: master.durationMinutes,
      totalQuestions: master.totalQuestions || frozenQuestions.length,
      totalPoints: master.totalPoints || frozenQuestions.reduce((s, q) => s + (q.points || 0), 0),
      questions: sanitizedQuestions,
      serverTimestamp,
    };

    const contentHash = DeterministicPRNG.computeContentHash(frozenPayload);

    return {
      frozenPayload,
      sanitizedManifest,
      contentHash,
    };
  }
}
