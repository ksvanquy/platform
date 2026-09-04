import { AuthoringQuestion, ScoringPolicyConfig } from '../authoring/quiz-version.entity.js';
import { AttemptScoreResult, CandidateAnswerRecord, QuestionScoreDetail } from '../delivery/attempt.aggregate.js';
import { QuestionRegistry } from '../question-engine/question.registry.js';

export interface AssessmentScoringInput {
  readonly questions: readonly AuthoringQuestion[];
  readonly answers: Readonly<Record<string, CandidateAnswerRecord>>;
  readonly scoringPolicy: ScoringPolicyConfig;
  readonly passingScore: number;
}

export class AssessmentScoringEngine {
  static evaluate(
    input: AssessmentScoringInput,
    registry: QuestionRegistry = QuestionRegistry.getInstance()
  ): AttemptScoreResult {
    const { questions, answers, scoringPolicy, passingScore } = input;
    const breakdown: Record<string, QuestionScoreDetail> = {};
    let totalScore = 0;
    let maxScore = 0;

    for (const question of questions) {
      const questionMaxScore = question.points || 1;
      maxScore += questionMaxScore;

      const record = answers[question.id];
      if (!record || record.answer === undefined || record.answer === null) {
        breakdown[question.id] = {
          isCorrect: false,
          scoreAwarded: 0,
          maxScore: questionMaxScore,
          feedback: 'Not answered',
        };
        continue;
      }

      const handler = registry.get(question.type);
      if (!handler) {
        breakdown[question.id] = {
          isCorrect: false,
          scoreAwarded: 0,
          maxScore: questionMaxScore,
          feedback: `Unsupported question type: ${question.type}`,
        };
        continue;
      }

      const evalResult = handler.evaluate(question, record.answer as any, {
        strategyType: scoringPolicy.strategyType,
        negativeMarkingPenalty: scoringPolicy.negativeMarkingPenalty,
      });

      breakdown[question.id] = {
        isCorrect: evalResult.isCorrect,
        scoreAwarded: evalResult.scoreAwarded,
        maxScore: evalResult.maxScore,
        feedback: evalResult.feedback,
      };

      totalScore += evalResult.scoreAwarded;
    }

    const finalScore = Math.max(0, Math.round(totalScore * 100) / 100);
    const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 10000) / 100 : 0;
    const passed = finalScore >= passingScore;

    return {
      score: finalScore,
      maxScore,
      percentage,
      passed,
      evaluatedAt: new Date(),
      breakdown: Object.freeze(breakdown),
    };
  }
}
