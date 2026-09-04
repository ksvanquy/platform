export interface AuthoringQuestionOption {
  readonly id: string;
  readonly text: string;
  readonly isCorrect: boolean;
}

export type QuestionType = 'single-choice' | 'multiple-choice' | 'true-false' | string;

export interface AuthoringQuestion {
  readonly id: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly points: number;
  readonly options?: readonly AuthoringQuestionOption[];
  readonly correctAnswer?: unknown;
  readonly explanation?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RandomizationPolicy {
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export interface ScoringPolicyConfig {
  readonly strategyType: 'exact-match' | 'partial-credit' | 'negative-marking';
  readonly negativeMarkingPenalty?: number; // e.g. 0.25
}

export interface QuizVersionProps {
  id: string;
  quizId: string;
  versionNumber: number;
  durationMinutes: number;
  passingScore: number;
  maxAttempts?: number; // 0 = unlimited, >= 1 = limit
  questions: readonly AuthoringQuestion[];
  scoringPolicy: ScoringPolicyConfig;
  randomizationPolicy: RandomizationPolicy;
  createdAt?: Date;
}

/**
 * QuizVersion: Entity bất biến (Immutable Snapshot)
 * Đại diện cho cấu trúc và nội dung hoàn chỉnh của một đề thi tại thời điểm tạo/xuất bản.
 */
export class QuizVersion {
  readonly id: string;
  readonly quizId: string;
  readonly versionNumber: number;
  readonly durationMinutes: number;
  readonly passingScore: number;
  readonly maxAttempts: number;
  readonly questions: readonly AuthoringQuestion[];
  readonly scoringPolicy: Readonly<ScoringPolicyConfig>;
  readonly randomizationPolicy: Readonly<RandomizationPolicy>;
  readonly createdAt: Date;

  constructor(props: QuizVersionProps) {
    if (props.durationMinutes <= 0) {
      throw new Error('durationMinutes must be greater than 0');
    }
    if (props.versionNumber <= 0) {
      throw new Error('versionNumber must be a positive integer');
    }

    this.id = props.id;
    this.quizId = props.quizId;
    this.versionNumber = props.versionNumber;
    this.durationMinutes = props.durationMinutes;
    this.passingScore = props.passingScore;
    this.maxAttempts = props.maxAttempts ?? 1;
    this.questions = Object.freeze([...props.questions]);
    this.scoringPolicy = Object.freeze({ ...props.scoringPolicy });
    this.randomizationPolicy = Object.freeze({ ...props.randomizationPolicy });
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();

    Object.freeze(this);
  }

  get totalPoints(): number {
    return this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
  }

  get questionCount(): number {
    return this.questions.length;
  }
}
