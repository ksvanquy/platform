import type {
  AssessmentStatus,
  ScoringPolicyConfig,
  BlueprintCriterion,
  BlueprintDTO,
  AssessmentDTO,
} from '@platform/contracts';
import {
  InvalidBlueprintCriteriaError,
  BlueprintLockedError,
} from '../errors/assessment-domain.errors.js';

export interface BlueprintProps {
  id: string;
  assessmentId: string;
  versionNumber: number;
  durationMinutes: number;
  passingPercentage: number;
  maxAttempts: number;
  criteria: BlueprintCriterion[];
  scoringPolicy: ScoringPolicyConfig;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Blueprint {
  readonly id: string;
  readonly assessmentId: string;
  readonly versionNumber: number;
  private _durationMinutes: number;
  private _passingPercentage: number;
  private _maxAttempts: number;
  private _criteria: BlueprintCriterion[];
  private _scoringPolicy: ScoringPolicyConfig;
  private _isLocked: boolean;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: BlueprintProps) {
    if (!props.id) throw new InvalidBlueprintCriteriaError('Blueprint ID is required');
    if (!props.assessmentId) throw new InvalidBlueprintCriteriaError('Assessment ID is required');
    if (props.versionNumber < 1) throw new InvalidBlueprintCriteriaError('Version number must be >= 1');
    if (props.durationMinutes < 1) throw new InvalidBlueprintCriteriaError('Duration must be at least 1 minute');
    if (props.passingPercentage < 0 || props.passingPercentage > 100) {
      throw new InvalidBlueprintCriteriaError('Passing percentage must be between 0 and 100');
    }

    this.id = props.id;
    this.assessmentId = props.assessmentId;
    this.versionNumber = props.versionNumber;
    this._durationMinutes = props.durationMinutes;
    this._passingPercentage = props.passingPercentage;
    this._maxAttempts = props.maxAttempts || 1;
    this._criteria = props.criteria || [];
    this._scoringPolicy = props.scoringPolicy || { strategyType: 'STANDARD', roundingDecimal: 2 };
    this._isLocked = props.isLocked ?? false;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get durationMinutes(): number {
    return this._durationMinutes;
  }

  get passingPercentage(): number {
    return this._passingPercentage;
  }

  get maxAttempts(): number {
    return this._maxAttempts;
  }

  get criteria(): BlueprintCriterion[] {
    return this._criteria;
  }

  get scoringPolicy(): ScoringPolicyConfig {
    return this._scoringPolicy;
  }

  get isLocked(): boolean {
    return this._isLocked;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  lock(): void {
    this._isLocked = true;
    this._updatedAt = new Date();
  }

  updateCriteria(
    criteria: BlueprintCriterion[],
    scoringPolicy?: ScoringPolicyConfig,
    durationMinutes?: number,
    passingPercentage?: number,
    maxAttempts?: number
  ): void {
    if (this._isLocked) {
      throw new BlueprintLockedError();
    }

    if (durationMinutes !== undefined) {
      if (durationMinutes < 1) throw new InvalidBlueprintCriteriaError('Duration must be at least 1 minute');
      this._durationMinutes = durationMinutes;
    }
    if (passingPercentage !== undefined) {
      if (passingPercentage < 0 || passingPercentage > 100) {
        throw new InvalidBlueprintCriteriaError('Passing percentage must be between 0 and 100');
      }
      this._passingPercentage = passingPercentage;
    }
    if (maxAttempts !== undefined) {
      this._maxAttempts = maxAttempts;
    }
    if (criteria !== undefined) {
      this._criteria = criteria;
    }
    if (scoringPolicy !== undefined) {
      this._scoringPolicy = scoringPolicy;
    }
    this._updatedAt = new Date();
  }

  toDTO(): BlueprintDTO {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      versionNumber: this.versionNumber,
      durationMinutes: this.durationMinutes,
      passingPercentage: this.passingPercentage,
      maxAttempts: this.maxAttempts,
      criteria: this.criteria,
      scoringPolicy: this.scoringPolicy,
      isLocked: this.isLocked,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

export interface AssessmentProps {
  id: string;
  code: string;
  title: string;
  description?: string;
  ownerId: string;
  primaryTopicNodeId?: string | null;
  gradeNodeId?: string | null;
  status: AssessmentStatus;
  currentBlueprintId?: string | null;
  currentBlueprint?: Blueprint;
  createdAt: Date;
  updatedAt: Date;
}

export class Assessment {
  readonly id: string;
  readonly code: string;
  private _title: string;
  private _description?: string;
  readonly ownerId: string;
  private _primaryTopicNodeId?: string | null;
  private _gradeNodeId?: string | null;
  private _status: AssessmentStatus;
  private _currentBlueprintId?: string | null;
  private _currentBlueprint?: Blueprint;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: AssessmentProps) {
    if (!props.id) throw new InvalidBlueprintCriteriaError('Assessment ID is required');
    if (!props.code || props.code.trim().length === 0) {
      throw new InvalidBlueprintCriteriaError('Assessment code is required');
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new InvalidBlueprintCriteriaError('Assessment title is required');
    }

    this.id = props.id;
    this.code = props.code.trim();
    this._title = props.title.trim();
    this._description = props.description;
    this.ownerId = props.ownerId;
    this._primaryTopicNodeId = props.primaryTopicNodeId ?? null;
    this._gradeNodeId = props.gradeNodeId ?? null;
    this._status = props.status;
    this._currentBlueprintId = props.currentBlueprintId ?? null;
    this._currentBlueprint = props.currentBlueprint;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get title(): string {
    return this._title;
  }

  get description(): string | undefined {
    return this._description;
  }

  get primaryTopicNodeId(): string | null | undefined {
    return this._primaryTopicNodeId;
  }

  get gradeNodeId(): string | null | undefined {
    return this._gradeNodeId;
  }

  get status(): AssessmentStatus {
    return this._status;
  }

  get currentBlueprintId(): string | null | undefined {
    return this._currentBlueprintId;
  }

  get currentBlueprint(): Blueprint | undefined {
    return this._currentBlueprint;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  attachBlueprint(blueprint: Blueprint): void {
    if (blueprint.assessmentId !== this.id) {
      throw new InvalidBlueprintCriteriaError('Blueprint does not belong to this assessment');
    }
    this._currentBlueprint = blueprint;
    this._currentBlueprintId = blueprint.id;
    this._updatedAt = new Date();
  }

  updateDetails(
    title?: string,
    description?: string,
    primaryTopicNodeId?: string | null,
    gradeNodeId?: string | null
  ): void {
    if (title !== undefined && title.trim().length > 0) {
      this._title = title.trim();
    }
    if (description !== undefined) {
      this._description = description;
    }
    if (primaryTopicNodeId !== undefined) {
      this._primaryTopicNodeId = primaryTopicNodeId;
    }
    if (gradeNodeId !== undefined) {
      this._gradeNodeId = gradeNodeId;
    }
    this._updatedAt = new Date();
  }

  transitionStatus(newStatus: AssessmentStatus): void {
    // Lifecycle validation: DRAFT -> REVIEW -> APPROVED -> ARCHIVED
    if (this._status === 'ARCHIVED') {
      throw new InvalidBlueprintCriteriaError('Archived assessments cannot transition to other statuses');
    }
    this._status = newStatus;
    if (newStatus === 'APPROVED' && this._currentBlueprint) {
      this._currentBlueprint.lock();
    }
    this._updatedAt = new Date();
  }

  toDTO(): AssessmentDTO {
    return {
      id: this.id,
      code: this.code,
      title: this.title,
      description: this.description,
      ownerId: this.ownerId,
      primaryTopicNodeId: this.primaryTopicNodeId,
      gradeNodeId: this.gradeNodeId,
      status: this.status,
      currentBlueprint: this.currentBlueprint ? this.currentBlueprint.toDTO() : undefined,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
