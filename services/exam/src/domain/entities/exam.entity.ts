import type {
  ExamDTO,
  ExamStatus,
  ExamSnapshotDTO,
  ExamVariantSummary,
  SanitizedExamManifest,
  FrozenQuestionItem,
  ScoringPolicyConfig,
  ExamAssessmentMeta,
  ExamPermutationMapping,
  ExamMasterPayload,
} from '@platform/contracts';
import { InvalidExamDataError } from '../errors/exam-domain.errors.js';
import { PermutationHydrator } from '../services/permutation-hydrator.service.js';

export interface ExamProps {
  id: string;
  assessmentId: string;
  code: string;
  title: string;
  startTime?: Date | null;
  endTime?: Date | null;
  durationMinutes: number;
  isPublished?: boolean;
  randomizationSeedBase?: number;
  status?: ExamStatus;
  createdAt?: Date;
}

export class Exam {
  readonly id: string;
  readonly assessmentId: string;
  readonly code: string;
  private _title: string;
  private _startTime: Date | null;
  private _endTime: Date | null;
  private _durationMinutes: number;
  private _isPublished: boolean;
  readonly randomizationSeedBase: number;
  private _status: ExamStatus;
  readonly createdAt: Date;

  constructor(props: ExamProps) {
    if (!props.id) throw new InvalidExamDataError('Exam ID is required');
    if (!props.assessmentId) throw new InvalidExamDataError('Assessment ID is required');
    if (!props.code || props.code.trim().length === 0) {
      throw new InvalidExamDataError('Exam code is required');
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new InvalidExamDataError('Exam title is required');
    }
    if (props.durationMinutes <= 0) {
      throw new InvalidExamDataError('Duration minutes must be greater than 0');
    }

    this.id = props.id;
    this.assessmentId = props.assessmentId;
    this.code = props.code.trim();
    this._title = props.title.trim();
    this._startTime = props.startTime ?? null;
    this._endTime = props.endTime ?? null;
    this._durationMinutes = props.durationMinutes;
    this._isPublished = props.isPublished ?? false;
    this.randomizationSeedBase = props.randomizationSeedBase ?? 1337;
    this._status = props.status ?? 'READY';
    this.createdAt = props.createdAt ?? new Date();
  }

  get title(): string {
    return this._title;
  }

  get startTime(): Date | null {
    return this._startTime;
  }

  get endTime(): Date | null {
    return this._endTime;
  }

  get durationMinutes(): number {
    return this._durationMinutes;
  }

  get isPublished(): boolean {
    return this._isPublished;
  }

  get status(): ExamStatus {
    return this._status;
  }

  updateDetails(details: {
    title?: string;
    startTime?: Date | null;
    endTime?: Date | null;
    durationMinutes?: number;
    isPublished?: boolean;
    status?: ExamStatus;
  }): void {
    if (details.title !== undefined) {
      if (!details.title.trim()) throw new InvalidExamDataError('Title cannot be empty');
      this._title = details.title.trim();
    }
    if (details.startTime !== undefined) {
      this._startTime = details.startTime;
    }
    if (details.endTime !== undefined) {
      this._endTime = details.endTime;
    }
    if (details.durationMinutes !== undefined) {
      if (details.durationMinutes <= 0) {
        throw new InvalidExamDataError('Duration must be greater than 0');
      }
      this._durationMinutes = details.durationMinutes;
    }
    if (details.isPublished !== undefined) {
      this._isPublished = details.isPublished;
    }
    if (details.status !== undefined) {
      this._status = details.status;
    }
  }

  publish(): void {
    this._isPublished = true;
  }

  unpublish(): void {
    this._isPublished = false;
  }

  activate(): void {
    this._status = 'ACTIVE';
  }

  close(): void {
    this._status = 'CLOSED';
  }

  toDTO(variants?: ExamVariantSummary[], assessment?: ExamAssessmentMeta): ExamDTO {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      code: this.code,
      title: this._title,
      startTime: this._startTime ? this._startTime.toISOString() : null,
      endTime: this._endTime ? this._endTime.toISOString() : null,
      durationMinutes: this._durationMinutes,
      isPublished: this._isPublished,
      randomizationSeedBase: this.randomizationSeedBase,
      status: this._status,
      variantsCount: variants ? variants.length : undefined,
      variants: variants,
      createdAt: this.createdAt.toISOString(),
      assessment,
    };
  }
}

export interface ExamSnapshotProps {
  id: string;
  examId: string;
  variantCode: string;
  contentHash: string;
  permutationMapping?: ExamPermutationMapping;
  masterPayload?: ExamMasterPayload;
  frozenPayload?: {
    questions: FrozenQuestionItem[];
    scoringPolicy: ScoringPolicyConfig;
  } | null;
  sanitizedManifest?: SanitizedExamManifest | null;
  createdAt?: Date;
}

export class ExamSnapshot {
  readonly id: string;
  readonly examId: string;
  readonly variantCode: string;
  readonly contentHash: string;
  readonly permutationMapping?: ExamPermutationMapping;
  private _masterPayload?: ExamMasterPayload;
  private _frozenPayload: {
    questions: FrozenQuestionItem[];
    scoringPolicy: ScoringPolicyConfig;
  } | null;
  private _sanitizedManifest: SanitizedExamManifest | null;
  readonly createdAt: Date;

  constructor(props: ExamSnapshotProps) {
    if (!props.id) throw new InvalidExamDataError('Snapshot ID is required');
    if (!props.examId) throw new InvalidExamDataError('Exam ID is required');
    if (!props.variantCode) throw new InvalidExamDataError('Variant code is required');
    if (!props.contentHash) throw new InvalidExamDataError('Content hash is required');
    if (!props.frozenPayload && !props.permutationMapping) {
      throw new InvalidExamDataError('Either frozen payload or permutation mapping is required');
    }

    this.id = props.id;
    this.examId = props.examId;
    this.variantCode = props.variantCode;
    this.contentHash = props.contentHash;
    this.permutationMapping = props.permutationMapping;
    this._masterPayload = props.masterPayload;
    this._frozenPayload = props.frozenPayload ?? null;
    this._sanitizedManifest = props.sanitizedManifest ?? null;
    this.createdAt = props.createdAt ?? new Date();

    // If frozenPayload is not present but masterPayload + permutationMapping are provided, hydrate immediately
    if (!this._frozenPayload && this._masterPayload && this.permutationMapping) {
      this.hydrateFromMaster(this._masterPayload);
    }
  }

  attachMasterPayload(master: ExamMasterPayload): void {
    this._masterPayload = master;
    if (!this._frozenPayload && this.permutationMapping) {
      this.hydrateFromMaster(master);
    }
  }

  private hydrateFromMaster(master: ExamMasterPayload): void {
    if (!this.permutationMapping) return;
    const hydrated = PermutationHydrator.hydrate(master, this.permutationMapping, this.createdAt.getTime());
    this._frozenPayload = hydrated.frozenPayload;
    this._sanitizedManifest = hydrated.sanitizedManifest;
  }

  get frozenPayload(): {
    questions: FrozenQuestionItem[];
    scoringPolicy: ScoringPolicyConfig;
  } {
    if (!this._frozenPayload) {
      if (this._masterPayload && this.permutationMapping) {
        this.hydrateFromMaster(this._masterPayload);
      } else {
        throw new InvalidExamDataError(
          `Snapshot ${this.id} (${this.variantCode}) has not been hydrated with master payload.`
        );
      }
    }
    return this._frozenPayload!;
  }

  get sanitizedManifest(): SanitizedExamManifest {
    if (!this._sanitizedManifest) {
      if (this._masterPayload && this.permutationMapping) {
        this.hydrateFromMaster(this._masterPayload);
      } else {
        throw new InvalidExamDataError(
          `Snapshot ${this.id} (${this.variantCode}) has not been hydrated with master payload.`
        );
      }
    }
    return this._sanitizedManifest!;
  }

  get masterPayload(): ExamMasterPayload | undefined {
    return this._masterPayload;
  }

  toDTO(): ExamSnapshotDTO {
    return {
      id: this.id,
      examId: this.examId,
      variantCode: this.variantCode,
      contentHash: this.contentHash,
      permutationMapping: this.permutationMapping,
      frozenPayload: this.frozenPayload,
      sanitizedManifest: this.sanitizedManifest,
      createdAt: this.createdAt.toISOString(),
    };
  }

  toVariantSummary(): ExamVariantSummary {
    return {
      variantCode: this.variantCode,
      contentHash: this.contentHash,
      questionCount:
        this._sanitizedManifest?.totalQuestions ??
        this._sanitizedManifest?.questions?.length ??
        this.permutationMapping?.questionOrder?.length ??
        0,
    };
  }
}
