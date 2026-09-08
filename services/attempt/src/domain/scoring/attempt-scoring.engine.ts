import type {
  FrozenQuestionItem,
  ScoringPolicyConfig,
  CandidateAnswerRecord,
  AttemptScoreResult,
  QuestionScoreBreakdown,
} from '@platform/contracts';

export interface ScoringEngineInput {
  questions: FrozenQuestionItem[];
  answers: Record<string, CandidateAnswerRecord>;
  scoringPolicy?: ScoringPolicyConfig;
  passingScore?: number;
}

export class AttemptScoringEngine {
  static evaluate(input: ScoringEngineInput): AttemptScoreResult {
    const { questions, answers, scoringPolicy, passingScore = 0 } = input;
    const strategy = scoringPolicy?.strategyType || 'standard';
    const negativePenaltyRate = scoringPolicy?.negativeMarkingPenalty ?? 0.25;

    const breakdown: Record<string, QuestionScoreBreakdown> = {};
    let totalScore = 0;
    let maxScore = 0;

    for (const question of questions) {
      const qMax = question.points && question.points > 0 ? question.points : 1;
      maxScore += qMax;

      const record = answers[question.id];
      if (!record || record.answer === undefined || record.answer === null) {
        const correctOpt = question.options?.find((o) => o.isCorrect);
        breakdown[question.id] = {
          questionId: question.id,
          isCorrect: false,
          scoreAwarded: 0,
          maxScore: qMax,
          candidateAnswer: null,
          correctAnswer: correctOpt?.id ?? null,
          explanation: question.explanation,
          feedback: 'Chưa trả lời',
        };
        continue;
      }

      const rawAnswer = record.answer;
      const evalDetail = this.evaluateQuestion(question, rawAnswer, qMax, strategy, negativePenaltyRate);

      breakdown[question.id] = {
        questionId: question.id,
        isCorrect: evalDetail.isCorrect,
        scoreAwarded: evalDetail.scoreAwarded,
        maxScore: qMax,
        candidateAnswer: rawAnswer,
        correctAnswer: evalDetail.correctAnswer,
        explanation: question.explanation,
        feedback: evalDetail.feedback,
      };

      totalScore += evalDetail.scoreAwarded;
    }

    const finalScore = Math.max(0, Math.round(totalScore * 100) / 100);
    const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 10000) / 100 : 0;
    const passed = finalScore >= passingScore;

    return {
      score: finalScore,
      maxScore,
      percentage,
      passed,
      evaluatedAt: new Date().toISOString(),
      breakdown,
    };
  }

  private static evaluateQuestion(
    question: FrozenQuestionItem,
    candidateAnswer: unknown,
    maxScore: number,
    strategy: string,
    negativePenaltyRate: number
  ): {
    isCorrect: boolean;
    scoreAwarded: number;
    correctAnswer: unknown;
    feedback: string;
  } {
    switch (question.type as string) {
      case 'SINGLE':
      case 'TRUE_FALSE': {
        const selectedId = typeof candidateAnswer === 'string'
          ? candidateAnswer
          : (candidateAnswer as any)?.selectedOptionId;

        const correctOption = question.options?.find((o) => o.isCorrect);
        const isCorrect = Boolean(correctOption && correctOption.id === selectedId);

        if (isCorrect) {
          return {
            isCorrect: true,
            scoreAwarded: maxScore,
            correctAnswer: correctOption?.id,
            feedback: 'Chính xác',
          };
        }

        if (strategy === 'negative-marking') {
          const penalty = Math.round(maxScore * negativePenaltyRate * 100) / 100;
          return {
            isCorrect: false,
            scoreAwarded: -penalty,
            correctAnswer: correctOption?.id,
            feedback: `Không chính xác. Trừ ${penalty} điểm`,
          };
        }

        return {
          isCorrect: false,
          scoreAwarded: 0,
          correctAnswer: correctOption?.id,
          feedback: 'Không chính xác',
        };
      }

      case 'MULTIPLE': {
        let selectedIds: string[] = [];
        if (Array.isArray(candidateAnswer)) {
          selectedIds = candidateAnswer.map(String);
        } else if (candidateAnswer && Array.isArray((candidateAnswer as any).selectedOptionIds)) {
          selectedIds = (candidateAnswer as any).selectedOptionIds.map(String);
        }

        const correctOptions = question.options?.filter((o) => o.isCorrect) || [];
        const correctIds = correctOptions.map((o) => o.id);

        const candidateSet = new Set(selectedIds);
        const correctSet = new Set(correctIds);

        const isExactMatch =
          candidateSet.size === correctSet.size &&
          [...candidateSet].every((id) => correctSet.has(id));

        if (isExactMatch) {
          return {
            isCorrect: true,
            scoreAwarded: maxScore,
            correctAnswer: correctIds,
            feedback: 'Chính xác hoàn toàn',
          };
        }

        if (strategy === 'partial') {
          let correctSelected = 0;
          let incorrectSelected = 0;

          for (const id of candidateSet) {
            if (correctSet.has(id)) {
              correctSelected++;
            } else {
              incorrectSelected++;
            }
          }

          const totalCorrect = Math.max(1, correctSet.size);
          const ratio = Math.max(0, (correctSelected - incorrectSelected) / totalCorrect);
          const partialScore = Math.round(maxScore * ratio * 100) / 100;

          return {
            isCorrect: partialScore === maxScore,
            scoreAwarded: partialScore,
            correctAnswer: correctIds,
            feedback: `Đúng ${correctSelected}/${totalCorrect} ý (Điểm: ${partialScore}/${maxScore})`,
          };
        }

        return {
          isCorrect: false,
          scoreAwarded: 0,
          correctAnswer: correctIds,
          feedback: 'Không chính xác',
        };
      }

      case 'FILL_IN': {
        const text = typeof candidateAnswer === 'string'
          ? candidateAnswer.trim()
          : String((candidateAnswer as any)?.text || (candidateAnswer as any)?.value || '').trim();

        const correctOption = question.options?.find((o) => o.isCorrect) || question.options?.[0];
        const correctText = correctOption?.content?.trim() || '';

        const isCorrect = Boolean(
          correctText &&
          text.localeCompare(correctText, undefined, { sensitivity: 'accent' }) === 0
        );

        return {
          isCorrect,
          scoreAwarded: isCorrect ? maxScore : 0,
          correctAnswer: correctText,
          feedback: isCorrect ? 'Chính xác' : 'Không chính xác',
        };
      }

      case 'NUMERIC': {
        const val = typeof candidateAnswer === 'number'
          ? candidateAnswer
          : Number(String((candidateAnswer as any)?.value ?? candidateAnswer).trim());

        const correctOption = question.options?.find((o) => o.isCorrect) || question.options?.[0];
        const expectedVal = Number(correctOption?.content?.trim());

        const isCorrect = !isNaN(val) && !isNaN(expectedVal) && Math.abs(val - expectedVal) < 0.0001;

        return {
          isCorrect,
          scoreAwarded: isCorrect ? maxScore : 0,
          correctAnswer: expectedVal,
          feedback: isCorrect ? 'Chính xác' : 'Không chính xác',
        };
      }

      case 'ORDERING': {
        let order: string[] = [];
        if (Array.isArray(candidateAnswer)) {
          order = candidateAnswer.map(String);
        } else if (candidateAnswer && Array.isArray((candidateAnswer as any).order)) {
          order = (candidateAnswer as any).order.map(String);
        }

        const sortedCorrect = [...(question.options || [])]
          .sort((a, b) => ((a as any).orderIndex ?? 0) - ((b as any).orderIndex ?? 0))
          .map((o) => o.id);

        const isCorrect =
          order.length === sortedCorrect.length &&
          order.every((id, idx) => id === sortedCorrect[idx]);

        return {
          isCorrect,
          scoreAwarded: isCorrect ? maxScore : 0,
          correctAnswer: sortedCorrect,
          feedback: isCorrect ? 'Thứ tự chính xác' : 'Thứ tự không chính xác',
        };
      }

      case 'MATCHING': {
        const pairs = (candidateAnswer as any)?.pairs || candidateAnswer;
        const expectedPairs = question.pairs || [];

        let correctMatches = 0;
        for (const ep of expectedPairs) {
          if (pairs && pairs[ep.leftId] === ep.rightId) {
            correctMatches++;
          }
        }

        const totalExpected = Math.max(1, expectedPairs.length);
        const isAllCorrect = correctMatches === totalExpected;
        const score = Math.round(maxScore * (correctMatches / totalExpected) * 100) / 100;

        return {
          isCorrect: isAllCorrect,
          scoreAwarded: score,
          correctAnswer: expectedPairs.reduce((acc, p) => ({ ...acc, [p.leftId]: p.rightId }), {}),
          feedback: `Ghép đúng ${correctMatches}/${totalExpected} cặp`,
        };
      }

      case 'ESSAY':
      default: {
        return {
          isCorrect: false,
          scoreAwarded: 0,
          correctAnswer: null,
          feedback: 'Cần chấm điểm thủ công',
        };
      }
    }
  }
}
