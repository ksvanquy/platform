import type {
  QuestionType,
  QuestionDifficulty,
  QuestionStatus,
  QuestionOption,
  MatchingPair,
  MediaAsset,
  QuestionDTO,
  QuestionRevisionDTO,
} from '@platform/contracts';
import { InvalidQuestionDataError } from '../errors/question-domain.errors.js';

export interface QuestionRevisionProps {
  id: string;
  questionId: string;
  revisionNumber: number;
  prompt: string;
  options: QuestionOption[];
  pairs?: MatchingPair[];
  explanation?: string;
  rubric?: Record<string, unknown>;
  mediaAssets?: MediaAsset[];
  createdBy: string;
  createdAt: Date;
}

export class QuestionRevision {
  readonly id: string;
  readonly questionId: string;
  readonly revisionNumber: number;
  readonly prompt: string;
  readonly options: QuestionOption[];
  readonly pairs?: MatchingPair[];
  readonly explanation?: string;
  readonly rubric?: Record<string, unknown>;
  readonly mediaAssets?: MediaAsset[];
  readonly createdBy: string;
  readonly createdAt: Date;

  constructor(props: QuestionRevisionProps) {
    if (!props.id) throw new InvalidQuestionDataError('Revision ID is required');
    if (!props.questionId) throw new InvalidQuestionDataError('Question ID is required');
    if (props.revisionNumber < 1) throw new InvalidQuestionDataError('Revision number must be >= 1');
    if (!props.prompt || props.prompt.trim().length === 0) {
      throw new InvalidQuestionDataError('Question prompt cannot be empty');
    }

    this.id = props.id;
    this.questionId = props.questionId;
    this.revisionNumber = props.revisionNumber;
    this.prompt = props.prompt;
    this.options = props.options || [];
    this.pairs = props.pairs;
    this.explanation = props.explanation;
    this.rubric = props.rubric;
    this.mediaAssets = props.mediaAssets;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
  }

  toDTO(): QuestionRevisionDTO {
    return {
      id: this.id,
      questionId: this.questionId,
      revisionNumber: this.revisionNumber,
      prompt: this.prompt,
      options: this.options,
      pairs: this.pairs,
      explanation: this.explanation,
      rubric: this.rubric,
      mediaAssets: this.mediaAssets,
      createdBy: this.createdBy,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

export interface QuestionProps {
  id: string;
  code: string;
  type: QuestionType;
  topicNodeId?: string | null;
  gradeNodeId?: string | null;
  difficulty: QuestionDifficulty;
  defaultPoints: number;
  status: QuestionStatus;
  currentRevisionId?: string | null;
  ownerId: string;
  currentRevision?: QuestionRevision;
  createdAt: Date;
  updatedAt: Date;
}

export class Question {
  readonly id: string;
  readonly code: string;
  readonly type: QuestionType;
  readonly topicNodeId?: string | null;
  readonly gradeNodeId?: string | null;
  readonly difficulty: QuestionDifficulty;
  readonly defaultPoints: number;
  private _status: QuestionStatus;
  private _currentRevisionId?: string | null;
  private _currentRevision?: QuestionRevision;
  readonly ownerId: string;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: QuestionProps) {
    if (!props.id) throw new InvalidQuestionDataError('Question ID is required');
    if (!props.code || props.code.trim().length === 0) {
      throw new InvalidQuestionDataError('Question code is required');
    }
    if (props.defaultPoints < 0) {
      throw new InvalidQuestionDataError('Default points must be non-negative');
    }

    this.id = props.id;
    this.code = props.code.trim();
    this.type = props.type;
    this.topicNodeId = props.topicNodeId ?? null;
    this.gradeNodeId = props.gradeNodeId ?? null;
    this.difficulty = props.difficulty;
    this.defaultPoints = props.defaultPoints;
    this._status = props.status;
    this._currentRevisionId = props.currentRevisionId ?? null;
    this._currentRevision = props.currentRevision;
    this.ownerId = props.ownerId;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get status(): QuestionStatus {
    return this._status;
  }

  get currentRevisionId(): string | null | undefined {
    return this._currentRevisionId;
  }

  get currentRevision(): QuestionRevision | undefined {
    return this._currentRevision;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  attachRevision(revision: QuestionRevision): void {
    if (revision.questionId !== this.id) {
      throw new InvalidQuestionDataError('Revision does not belong to this question');
    }
    this._currentRevision = revision;
    this._currentRevisionId = revision.id;
    this._updatedAt = new Date();
  }

  updateStatus(status: QuestionStatus): void {
    this._status = status;
    this._updatedAt = new Date();
  }

  toDTO(): QuestionDTO {
    return {
      id: this.id,
      code: this.code,
      type: this.type,
      topicNodeId: this.topicNodeId,
      gradeNodeId: this.gradeNodeId,
      difficulty: this.difficulty,
      defaultPoints: this.defaultPoints,
      status: this.status,
      currentRevisionId: this.currentRevisionId,
      ownerId: this.ownerId,
      currentRevision: this.currentRevision ? this.currentRevision.toDTO() : undefined,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
