import { ScoringStrategy, EvaluationDetail } from './scoring.strategy.js';
import {
  SingleChoiceStrategy,
  MultipleChoiceStrategy,
  FillInStrategy,
  MatchingStrategy,
  OrderingStrategy,
  NumericToleranceStrategy,
} from './strategies.js';
import { Question, UserAnswerValue, UserAnswers } from '../entities/quiz.js';

export interface EvaluationResult {
  readonly totalScoreAwarded: number;
  readonly totalMaxScore: number;
  readonly percentage: number;
  readonly isPassed?: boolean;
  readonly details: Record<string, EvaluationDetail>;
}

export class ScoringFactory {
  private static strategies: Map<string, ScoringStrategy> = new Map();

  /**
   * Đăng ký thêm Strategy mới từ bên ngoài bất kỳ lúc nào (Open/Closed Principle)
   */
  static register(type: string, strategy: ScoringStrategy): void {
    this.strategies.set(type.toUpperCase(), strategy);
  }

  static getStrategy(type: string): ScoringStrategy {
    const strategy = this.strategies.get(type.toUpperCase());
    if (!strategy) {
      throw new Error(`[ScoringEngine] Unsupported question type: "${type}". Register it using ScoringFactory.register()`);
    }
    return strategy;
  }

  static hasStrategy(type: string): boolean {
    return this.strategies.has(type.toUpperCase());
  }

  static listSupportedTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  static evaluateQuestion(question: Question, userAnswer: UserAnswerValue): EvaluationDetail {
    const maxScore = question.points ?? 1;

    if (userAnswer === undefined || userAnswer === null || userAnswer === '') {
      return { isCorrect: false, scoreAwarded: 0, maxScore, feedback: 'Chưa trả lời.' };
    }

    const strategy = this.getStrategy(question.type);
    return strategy.evaluate(question, userAnswer);
  }

  static calculateScore(
    questions: readonly Question[],
    userAnswers: UserAnswers,
    passingPercentage?: number
  ): EvaluationResult {
    let totalScoreAwarded = 0;
    let totalMaxScore = 0;
    const details: Record<string, EvaluationDetail> = {};

    questions.forEach((question) => {
      const result = this.evaluateQuestion(question, userAnswers[question.id]);
      totalScoreAwarded += result.scoreAwarded;
      totalMaxScore += result.maxScore;
      details[question.id] = result;
    });

    totalScoreAwarded = Number(totalScoreAwarded.toFixed(2));
    const percentage =
      totalMaxScore > 0 ? Math.round((totalScoreAwarded / totalMaxScore) * 100) : 0;

    return {
      totalScoreAwarded,
      totalMaxScore,
      percentage,
      isPassed: passingPercentage !== undefined ? percentage >= passingPercentage : undefined,
      details,
    };
  }
}

// Open-Closed Registry alias
export const ScoringRegistry = ScoringFactory;
export const ScoringEngine = ScoringFactory;

// Default Built-in Register
ScoringFactory.register('SINGLE', new SingleChoiceStrategy());
ScoringFactory.register('MULTIPLE', new MultipleChoiceStrategy());
ScoringFactory.register('FILL_IN', new FillInStrategy());
ScoringFactory.register('MATCHING', new MatchingStrategy());
ScoringFactory.register('ORDERING', new OrderingStrategy());
ScoringFactory.register('NUMERIC', new NumericToleranceStrategy());
