import { QuizVersion } from './quiz-version.entity.js';
import { PublishingPolicy } from './publishing.policy.js';
import { QuizPublishInvariantViolationError } from '../errors/domain-errors.js';

export type QuizStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';

export interface QuizProps {
  id: string;
  code: string;
  title: string;
  description?: string;
  ownerId: string;
  primaryNodeId?: string | null;
  gradeNodeId?: string | null;
  isPublic?: boolean;
  currentPublishedVersionId?: string;
  status?: QuizStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Quiz (Entity):
 * Đại diện cho danh tính lâu dài (Long-lived Identity) của một đề thi trong Sub-domain Authoring.
 */
export class Quiz {
  readonly id: string;
  readonly code: string;
  private _title: string;
  private _description?: string;
  readonly ownerId: string;
  private _primaryNodeId?: string | null;
  private _gradeNodeId?: string | null;
  private _isPublic: boolean;
  private _currentPublishedVersionId?: string;
  private _status: QuizStatus;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: QuizProps) {
    if (!props.id || props.id.trim() === '') {
      throw new Error('Quiz ID is required');
    }
    if (!props.code || props.code.trim() === '') {
      throw new Error('Quiz code is required');
    }
    if (!props.title || props.title.trim() === '') {
      throw new Error('Quiz title is required');
    }

    this.id = props.id;
    this.code = props.code;
    this._title = props.title;
    this._description = props.description;
    this.ownerId = props.ownerId;
    this._primaryNodeId = props.primaryNodeId;
    this._gradeNodeId = props.gradeNodeId;
    this._isPublic = props.isPublic ?? false;
    this._currentPublishedVersionId = props.currentPublishedVersionId;
    this._status = props.status ?? 'DRAFT';
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this._updatedAt = props.updatedAt ? new Date(props.updatedAt) : new Date();
  }

  get title(): string {
    return this._title;
  }

  get primaryNodeId(): string | null | undefined {
    return this._primaryNodeId;
  }

  get gradeNodeId(): string | null | undefined {
    return this._gradeNodeId;
  }

  get isPublic(): boolean {
    return this._isPublic;
  }

  get description(): string | undefined {
    return this._description;
  }

  get status(): QuizStatus {
    return this._status;
  }

  get currentPublishedVersionId(): string | undefined {
    return this._currentPublishedVersionId;
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  /**
   * Cập nhật thông tin tiêu đề/mô tả ở trạng thái DRAFT hoặc REVIEW
   */
  updateDetails(
    title?: string,
    description?: string,
    isPublic?: boolean,
    primaryNodeId?: string | null,
    gradeNodeId?: string | null
  ): void {
    if (this._status === 'ARCHIVED') {
      throw new Error('Cannot update details of an ARCHIVED quiz');
    }
    if (title !== undefined) {
      this._title = title;
    }
    if (description !== undefined) {
      this._description = description;
    }
    if (isPublic !== undefined) {
      this._isPublic = isPublic;
    }
    if (primaryNodeId !== undefined) {
      this._primaryNodeId = primaryNodeId;
    }
    if (gradeNodeId !== undefined) {
      this._gradeNodeId = gradeNodeId;
    }
    this._updatedAt = new Date();
  }

  /**
   * Chuyển sang chờ duyệt nội dung
   */
  requestReview(): void {
    if (this._status === 'ARCHIVED') {
      throw new Error('Cannot request review for an ARCHIVED quiz');
    }
    this._status = 'REVIEW';
    this._updatedAt = new Date();
  }

  /**
   * Xuất bản phiên bản đề thi chính thức nếu thỏa mãn tất cả quy tắc Invariants
   */
  publish(version: QuizVersion): void {
    if (this._status === 'ARCHIVED') {
      throw new Error('Cannot publish an ARCHIVED quiz');
    }
    if (version.quizId !== this.id) {
      throw new QuizPublishInvariantViolationError(
        `Version quizId "${version.quizId}" does not match Quiz ID "${this.id}"`
      );
    }

    // Domain Invariant Check
    PublishingPolicy.validate(version);

    this._currentPublishedVersionId = version.id;
    this._status = 'PUBLISHED';
    this._updatedAt = new Date();
  }

  /**
   * Đóng/lưu trữ đề thi, ngăn chặn việc thi tiếp
   */
  archive(): void {
    this._status = 'ARCHIVED';
    this._updatedAt = new Date();
  }

  /**
   * Quay lại bản nháp để chuẩn bị chỉnh sửa hoặc phát hành phiên bản mới
   */
  createDraftVersion(): void {
    if (this._status === 'ARCHIVED') {
      throw new Error('Cannot create draft from an ARCHIVED quiz');
    }
    this._status = 'DRAFT';
    this._updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      title: this._title,
      description: this._description,
      ownerId: this.ownerId,
      primaryNodeId: this._primaryNodeId,
      gradeNodeId: this._gradeNodeId,
      isPublic: this._isPublic,
      currentPublishedVersionId: this._currentPublishedVersionId,
      status: this._status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
