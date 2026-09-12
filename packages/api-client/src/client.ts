import type {
  ApiResponse,
  TaxonomyDTO,
  TaxonomyNodeDTO,
  TaxonomyTreeDTO,
  BreadcrumbItemDTO,
  CreateTaxonomyInput,
  UpdateTaxonomyInput,
  CreateNodeInput,
  UpdateNodeInput,
  MoveNodeInput,
  QuestionDTO,
  QuestionRevisionDTO,
  CreateQuestionInput,
  UpdateQuestionInput,
  QuestionFilterQuery,
  AssessmentDTO,
  BlueprintDTO,
  CreateAssessmentInput,
  UpdateAssessmentInput,
  UpdateBlueprintInput,
  AssessmentFilterQuery,
  AssessmentStatus,
  ExamDTO,
  ExamStatus,
  ExamSnapshotDTO,
  ExamVariantSummary,
  GenerateExamInput,
  UpdateExamInput,
  SanitizedExamManifest,
  AttemptDTO,
  AttemptScoreResult,
  SubmitAttemptInput,
} from '@platform/contracts';

export type CandidateQuestionType =
  | 'SINGLE'
  | 'MULTIPLE'
  | 'FILL_IN'
  | 'MATCHING'
  | 'ORDERING'
  | 'NUMERIC';

export interface CandidateQuestionOption {
  readonly id: string;
  readonly content: string;
}

export interface CandidateMatchingPair {
  readonly id: string;
  readonly left: string;
  readonly right: string;
}

export interface CandidateOrderItem {
  readonly id: string;
  readonly content: string;
}

export interface CandidateQuestionMetadata {
  readonly options?: readonly CandidateQuestionOption[];
  readonly pairs?: readonly CandidateMatchingPair[];
  readonly itemsToOrder?: readonly CandidateOrderItem[];
  readonly [key: string]: unknown;
}

export interface CandidateQuestionDTO {
  readonly id: string;
  readonly type: CandidateQuestionType;
  readonly prompt: string;
  readonly points: number;
  readonly metadata?: CandidateQuestionMetadata;
}

export type CandidateSessionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'SUBMITTED'
  | 'TIMED_OUT_GRADED'
  | 'GRADED'
  | 'EXPIRED';

export interface CandidateSessionDTO {
  readonly id: string;
  readonly userId: string;
  readonly quizId: string;
  readonly durationMinutes: number;
  readonly status: CandidateSessionStatus;
  readonly startedAt: string;
  readonly deadline?: string;
  readonly submissionDeadline?: string;
  readonly remainingSeconds?: number;
  readonly serverTime?: string;
  readonly answers?: Record<string, unknown>;
}

export interface CandidateStartQuizResponse {
  readonly session: CandidateSessionDTO;
  readonly questions: readonly CandidateQuestionDTO[];
}

export interface CandidateQuestionEvaluationDetail {
  readonly isCorrect: boolean;
  readonly scoreAwarded: number;
  readonly maxScore: number;
  readonly feedback?: string;
}

export interface CandidateEvaluationResult {
  readonly totalScoreAwarded: number;
  readonly totalMaxScore: number;
  readonly percentage: number;
  readonly isPassed?: boolean;
  readonly details?: Record<string, CandidateQuestionEvaluationDetail>;
}

export interface CandidateResultRevealPolicy {
  readonly showDetails?: boolean;
  readonly showTotalScoreOnly?: boolean;
  readonly showPassFailOnly?: boolean;
}

export interface CandidateSubmitPayload {
  readonly sessionId: string;
  readonly userId: string;
  readonly answers?: Record<string, unknown>;
  readonly policy?: CandidateResultRevealPolicy;
}

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  onUnauthorized?: (error: ApiClientError) => void;
  onTimeSync?: (serverTime: string | number, offsetMs: number) => void;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, any>;
  body?: any;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  private baseUrl: string;
  private getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  private timeoutMs: number;
  private defaultHeaders: Record<string, string>;
  private fetchFn: typeof fetch;
  private onUnauthorized?: (error: ApiClientError) => void;
  private onTimeSync?: (serverTime: string | number, offsetMs: number) => void;
  private serverClockOffsetMs: number = 0;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.defaultHeaders = config.headers ?? {};
    this.fetchFn = config.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
    this.onUnauthorized = config.onUnauthorized;
    this.onTimeSync = config.onTimeSync;
  }

  /**
   * Đồng bộ độ lệch đồng hồ máy chủ từ mốc thời gian (timestamp hoặc ISO string)
   */
  syncFromTimestamp(serverTimestamp: number | string): void {
    const serverTimeMs = typeof serverTimestamp === 'string'
      ? new Date(serverTimestamp).getTime()
      : serverTimestamp;

    if (!isNaN(serverTimeMs)) {
      this.serverClockOffsetMs = serverTimeMs - Date.now();
      if (this.onTimeSync) {
        try {
          this.onTimeSync(serverTimestamp, this.serverClockOffsetMs);
        } catch {}
      }
    }
  }

  /**
   * Trả về mốc thời gian ước lượng hiện tại của server (Client Date.now() + offsetMs)
   */
  getServerNow(): number {
    return Date.now() + this.serverClockOffsetMs;
  }

  /**
   * Lấy độ lệch thời gian (ms) so với máy chủ
   */
  getClockOffsetMs(): number {
    return this.serverClockOffsetMs;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Thực hiện HTTP request chung với xử lý tự động JWT token và xử lý lỗi
   */
  async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, body, headers: customHeaders, ...fetchOptions } = options;

    let url = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...(customHeaders as Record<string, string>),
    };

    if (this.getToken && !headers['Authorization'] && !headers['authorization']) {
      const token = await this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    let reqBody: any = undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
        reqBody = body;
        if (body instanceof FormData) {
          delete headers['Content-Type'];
        }
      } else {
        reqBody = JSON.stringify(body);
      }
    }

    let controller: AbortController | undefined;
    let timeoutId: any;
    if (this.timeoutMs > 0 && typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), this.timeoutMs);
    }

    try {
      const response = await this.fetchFn(url, {
        ...fetchOptions,
        headers,
        body: reqBody,
        signal: controller ? controller.signal : fetchOptions.signal,
      });

      let responseData: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          responseData?.message ||
          responseData?.error ||
          `Request failed with status ${response.status}: ${response.statusText}`;
        const clientError = new ApiClientError(errorMessage, response.status, responseData);
        if (response.status === 401 && this.onUnauthorized) {
          try {
            this.onUnauthorized(clientError);
          } catch {
            // Ignore callback error
          }
        }
        throw clientError;
      }

      return responseData as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new ApiClientError(`Request timed out after ${this.timeoutMs}ms`, 408);
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  get<T = any>(path: string, params?: Record<string, any>, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET', params });
  }

  post<T = any>(path: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T = any>(path: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T = any>(path: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T = any>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Health check endpoint
   */
  async health(): Promise<{ status: string; engine?: string; timestamp?: string }> {
    return this.get('/health');
  }

  /**
   * Attempts API Domain Resource (RESTful v1 Delivery & High-Write Runtime Engine)
   */
  readonly attempts = {
    /**
     * Tạo hoặc khôi phục ca thi. Hỗ trợ cả legacy quizId string hoặc new exam payload.
     */
    create: async (
      quizIdOrPayload: string | { examId?: string; quizId?: string; variantCode?: string; userId?: string; metadata?: Record<string, unknown> }
    ): Promise<ApiResponse<any>> => {
      const body = typeof quizIdOrPayload === 'string'
        ? { quizId: quizIdOrPayload }
        : quizIdOrPayload;
      return this.post<ApiResponse<any>>('/v1/attempts', body);
    },

    /**
     * Tạo mới hoặc khôi phục ca thi đang dang dở (Multi-tab protection)
     */
    createOrRecover: async (payload: {
      examId?: string;
      quizId?: string;
      variantCode?: string;
      autoStart?: boolean;
      userId?: string;
      metadata?: Record<string, unknown>;
    }): Promise<ApiResponse<AttemptDTO>> => {
      const body = {
        ...payload,
        examId: payload.examId || payload.quizId || '',
        quizId: payload.quizId || payload.examId || '',
        userId: payload.userId,
      };
      return this.post<ApiResponse<AttemptDTO>>('/v1/attempts', body);
    },

    /**
     * Bắt đầu ca thi, kích hoạt đếm ngược thời gian từ đồng hồ máy chủ
     */
    start: async (attemptId: string, payload?: { userId?: string }): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/attempts/${encodeURIComponent(attemptId)}/start`, payload || {});
    },

    /**
     * Lấy thông tin ca thi hiện tại
     */
    get: async (attemptId: string): Promise<ApiResponse<AttemptDTO>> => {
      return this.get<ApiResponse<AttemptDTO>>(`/v1/attempts/${encodeURIComponent(attemptId)}`);
    },

    /**
     * Lấy danh sách các ca thi (thí sinh hoặc giảng viên giám thị)
     */
    list: async (params?: { examId?: string; studentId?: string; status?: string; userId?: string }): Promise<ApiResponse<AttemptDTO[]>> => {
      return this.get<ApiResponse<AttemptDTO[]>>('/v1/attempts', params);
    },

    /**
     * Nộp bài thi và kích hoạt chấm thi tức thời
     */
    submit: async (attemptId: string, payload?: SubmitAttemptInput): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/attempts/${encodeURIComponent(attemptId)}/submit`, payload || {});
    },

    /**
     * Xem kết quả chấm điểm chi tiết của ca thi
     */
    getResult: async (attemptId: string): Promise<ApiResponse<AttemptScoreResult>> => {
      return this.get<ApiResponse<AttemptScoreResult>>(`/v1/attempts/${encodeURIComponent(attemptId)}/result`);
    },

    /**
     * Lấy mốc thời gian máy chủ phục vụ đồng bộ đồng hồ
     */
    getTime: async (): Promise<ApiResponse<{ serverTime: string; timestampMs: number }>> => {
      return this.get<ApiResponse<{ serverTime: string; timestampMs: number }>>('/v1/time');
    },

    /**
     * Tự động truy vấn ca thi IN_PROGRESS còn hiệu lực của thí sinh (Auto-discovery & Rehydration)
     */
    getActive: async (userId?: string): Promise<AttemptDTO | null> => {
      if (!userId) return null;
      try {
        const res = await this.attempts.list({
          status: 'IN_PROGRESS',
          userId,
          studentId: userId,
        });
        const attempts = Array.isArray(res.data) ? res.data : (res as any).attempts || [];
        if (attempts && attempts.length > 0) {
          const now = this.getServerNow();
          const valid = attempts.find((a: any) => {
            if (a.status !== 'IN_PROGRESS') return false;
            const dl = a.deadline ? new Date(a.deadline).getTime() : 0;
            return dl === 0 || dl > now;
          });
          return valid || null;
        }
        return null;
      } catch {
        return null;
      }
    },
  };

  /**
   * Lấy mốc thời gian chuẩn từ máy chủ
   */
  async syncServerTime(): Promise<{
    serverTime: string;
    serverTimestampMs: number;
    rttMs: number;
    clockOffsetMs: number;
  }> {
    const t1 = Date.now();
    const res = await this.get<{ success: boolean; serverTime: string; timestampMs?: number }>('/v1/time');
    const t3 = Date.now();
    const serverTimestampMs = res.timestampMs ?? new Date(res.serverTime).getTime();
    const clockOffsetMs = serverTimestampMs - t3;
    this.serverClockOffsetMs = clockOffsetMs;
    if (this.onTimeSync) {
      try {
        this.onTimeSync(res.serverTime, clockOffsetMs);
      } catch {}
    }

    return {
      serverTime: res.serverTime,
      serverTimestampMs,
      rttMs: Math.max(0, t3 - t1),
      clockOffsetMs,
    };
  }

  /**
   * Taxonomies API Domain Resource (Knowledge Catalog & Hierarchical Tree)
   */
  readonly taxonomies = {
    list: async (): Promise<ApiResponse<TaxonomyDTO[]>> => {
      return this.get<ApiResponse<TaxonomyDTO[]>>('/v1/taxonomies');
    },

    get: async (codeOrId: string): Promise<ApiResponse<TaxonomyDTO>> => {
      return this.get<ApiResponse<TaxonomyDTO>>(`/v1/taxonomies/${encodeURIComponent(codeOrId)}`);
    },

    create: async (payload: CreateTaxonomyInput): Promise<ApiResponse<TaxonomyDTO>> => {
      return this.post<ApiResponse<TaxonomyDTO>>('/v1/taxonomies', payload);
    },

    update: async (codeOrId: string, payload: UpdateTaxonomyInput): Promise<ApiResponse<TaxonomyDTO>> => {
      return this.put<ApiResponse<TaxonomyDTO>>(`/v1/taxonomies/${encodeURIComponent(codeOrId)}`, payload);
    },

    getTree: async (codeOrId: string): Promise<ApiResponse<TaxonomyTreeDTO>> => {
      return this.get<ApiResponse<TaxonomyTreeDTO>>(`/v1/taxonomies/${encodeURIComponent(codeOrId)}/tree`);
    },

    createNode: async (codeOrId: string, payload: CreateNodeInput): Promise<ApiResponse<TaxonomyNodeDTO>> => {
      return this.post<ApiResponse<TaxonomyNodeDTO>>(`/v1/taxonomies/${encodeURIComponent(codeOrId)}/nodes`, payload);
    },

    getNode: async (nodeId: string): Promise<ApiResponse<TaxonomyNodeDTO>> => {
      return this.get<ApiResponse<TaxonomyNodeDTO>>(`/v1/nodes/${encodeURIComponent(nodeId)}`);
    },

    updateNode: async (nodeId: string, payload: UpdateNodeInput): Promise<ApiResponse<TaxonomyNodeDTO>> => {
      return this.put<ApiResponse<TaxonomyNodeDTO>>(`/v1/nodes/${encodeURIComponent(nodeId)}`, payload);
    },

    moveNode: async (nodeId: string, payload: MoveNodeInput): Promise<ApiResponse<TaxonomyNodeDTO>> => {
      return this.post<ApiResponse<TaxonomyNodeDTO>>(`/v1/nodes/${encodeURIComponent(nodeId)}/move`, payload);
    },

    deleteNode: async (nodeId: string): Promise<ApiResponse<void>> => {
      return this.delete<ApiResponse<void>>(`/v1/nodes/${encodeURIComponent(nodeId)}`);
    },

    getDescendantIds: async (nodeId: string): Promise<ApiResponse<{ rootId: string; descendantIds: string[] }>> => {
      return this.get<ApiResponse<{ rootId: string; descendantIds: string[] }>>(
        `/v1/nodes/${encodeURIComponent(nodeId)}/descendant-ids`
      );
    },

    getBreadcrumbs: async (nodeId: string): Promise<ApiResponse<BreadcrumbItemDTO[]>> => {
      return this.get<ApiResponse<BreadcrumbItemDTO[]>>(`/v1/nodes/${encodeURIComponent(nodeId)}/breadcrumbs`);
    },
  };

  /**
   * Questions API Domain Resource (Question Bank, LaTeX, Media & Revisions)
   */
  readonly questions = {
    list: async (filter?: QuestionFilterQuery): Promise<ApiResponse<QuestionDTO[]>> => {
      return this.get<ApiResponse<QuestionDTO[]>>('/v1/questions', filter);
    },

    get: async (idOrCode: string): Promise<ApiResponse<QuestionDTO>> => {
      return this.get<ApiResponse<QuestionDTO>>(`/v1/questions/${encodeURIComponent(idOrCode)}`);
    },

    create: async (payload: CreateQuestionInput): Promise<ApiResponse<QuestionDTO>> => {
      return this.post<ApiResponse<QuestionDTO>>('/v1/questions', payload);
    },

    update: async (id: string, payload: UpdateQuestionInput): Promise<ApiResponse<QuestionDTO>> => {
      return this.put<ApiResponse<QuestionDTO>>(`/v1/questions/${encodeURIComponent(id)}`, payload);
    },

    delete: async (id: string): Promise<ApiResponse<void>> => {
      return this.delete<ApiResponse<void>>(`/v1/questions/${encodeURIComponent(id)}`);
    },

    listRevisions: async (id: string): Promise<ApiResponse<QuestionRevisionDTO[]>> => {
      return this.get<ApiResponse<QuestionRevisionDTO[]>>(`/v1/questions/${encodeURIComponent(id)}/revisions`);
    },

    getRevision: async (id: string, revisionNumber: number): Promise<ApiResponse<QuestionRevisionDTO>> => {
      return this.get<ApiResponse<QuestionRevisionDTO>>(
        `/v1/questions/${encodeURIComponent(id)}/revisions/${revisionNumber}`
      );
    },

    addRevision: async (id: string, payload: any): Promise<ApiResponse<QuestionRevisionDTO>> => {
      return this.post<ApiResponse<QuestionRevisionDTO>>(
        `/v1/questions/${encodeURIComponent(id)}/revisions`,
        payload
      );
    },
  };

  /**
   * Assessments API Domain Resource (Blueprints, Criteria Matrix & Lifecycle)
   */
  readonly assessments = {
    list: async (filter?: AssessmentFilterQuery): Promise<ApiResponse<AssessmentDTO[]>> => {
      return this.get<ApiResponse<AssessmentDTO[]>>('/v1/assessments', filter);
    },

    get: async (idOrCode: string): Promise<ApiResponse<AssessmentDTO>> => {
      return this.get<ApiResponse<AssessmentDTO>>(`/v1/assessments/${encodeURIComponent(idOrCode)}`);
    },

    create: async (payload: CreateAssessmentInput): Promise<ApiResponse<AssessmentDTO>> => {
      return this.post<ApiResponse<AssessmentDTO>>('/v1/assessments', payload);
    },

    update: async (id: string, payload: UpdateAssessmentInput): Promise<ApiResponse<AssessmentDTO>> => {
      return this.put<ApiResponse<AssessmentDTO>>(`/v1/assessments/${encodeURIComponent(id)}`, payload);
    },

    updateStatus: async (id: string, status: AssessmentStatus): Promise<ApiResponse<AssessmentDTO>> => {
      return this.patch<ApiResponse<AssessmentDTO>>(`/v1/assessments/${encodeURIComponent(id)}/status`, { status });
    },

    updateBlueprint: async (id: string, payload: UpdateBlueprintInput): Promise<ApiResponse<BlueprintDTO>> => {
      return this.put<ApiResponse<BlueprintDTO>>(`/v1/assessments/${encodeURIComponent(id)}/blueprint`, payload);
    },

    lockBlueprint: async (id: string): Promise<ApiResponse<BlueprintDTO>> => {
      return this.post<ApiResponse<BlueprintDTO>>(`/v1/assessments/${encodeURIComponent(id)}/blueprint/lock`);
    },
  };

  /**
   * Exams API Domain Resource (Matrix Solver, PRNG Seed Variants & SHA-256 Snapshots)
   */
  readonly exams = {
    list: async (params?: { assessmentId?: string }): Promise<ApiResponse<ExamDTO[]>> => {
      return this.get<ApiResponse<ExamDTO[]>>('/v1/exams', params);
    },

    get: async (idOrCode: string): Promise<ApiResponse<ExamDTO>> => {
      return this.get<ApiResponse<ExamDTO>>(`/v1/exams/${encodeURIComponent(idOrCode)}`);
    },

    generate: async (payload: GenerateExamInput): Promise<ApiResponse<ExamDTO>> => {
      return this.post<ApiResponse<ExamDTO>>('/v1/exams', payload);
    },

    update: async (id: string, payload: UpdateExamInput): Promise<ApiResponse<ExamDTO>> => {
      return this.put<ApiResponse<ExamDTO>>(`/v1/exams/${encodeURIComponent(id)}`, payload);
    },

    updateStatus: async (id: string, status: ExamStatus): Promise<ApiResponse<ExamDTO>> => {
      return this.patch<ApiResponse<ExamDTO>>(`/v1/exams/${encodeURIComponent(id)}/status`, { status });
    },

    publish: async (id: string): Promise<ApiResponse<ExamDTO>> => {
      return this.post<ApiResponse<ExamDTO>>(`/v1/exams/${encodeURIComponent(id)}/publish`);
    },

    unpublish: async (id: string): Promise<ApiResponse<ExamDTO>> => {
      return this.post<ApiResponse<ExamDTO>>(`/v1/exams/${encodeURIComponent(id)}/unpublish`);
    },

    delete: async (id: string): Promise<ApiResponse<void>> => {
      return this.delete<ApiResponse<void>>(`/v1/exams/${encodeURIComponent(id)}`);
    },

    generateVariants: async (
      idOrCode: string,
      payload?: { variantsCount?: number }
    ): Promise<ApiResponse<ExamVariantSummary[]>> => {
      return this.post<ApiResponse<ExamVariantSummary[]>>(
        `/v1/exams/${encodeURIComponent(idOrCode)}/generate-variants`,
        payload || {}
      );
    },

    getSanitizedManifest: async (
      idOrCode: string,
      variantCode: string = 'DEFAULT'
    ): Promise<ApiResponse<SanitizedExamManifest>> => {
      return this.get<ApiResponse<SanitizedExamManifest>>(
        `/v1/exams/${encodeURIComponent(idOrCode)}/variants/${encodeURIComponent(variantCode)}/manifest`
      );
    },

    getFrozenSnapshot: async (
      idOrCode: string,
      variantCode: string = 'DEFAULT'
    ): Promise<ApiResponse<ExamSnapshotDTO>> => {
      return this.get<ApiResponse<ExamSnapshotDTO>>(
        `/v1/exams/${encodeURIComponent(idOrCode)}/variants/${encodeURIComponent(variantCode)}/frozen`
      );
    },
  };

  /**
   * Users Resource (Auth Service - Protected Admin Endpoints)
   */
  readonly users = {
    list: async (params?: Record<string, any>): Promise<ApiResponse<any[]>> => {
      return this.get<ApiResponse<any[]>>('/v1/auth/users', params);
    },
    updateStatus: async (userId: string, isActive: boolean): Promise<ApiResponse<any>> => {
      return this.patch<ApiResponse<any>>(`/v1/auth/users/${encodeURIComponent(userId)}/status`, { isActive });
    },
  };

  /**
   * Quizzes Resource (Legacy / v1 Authoring compatibility)
   */
  readonly quizzes = {
    list: async (params?: Record<string, any>): Promise<ApiResponse<any[]>> => {
      return this.get<ApiResponse<any[]>>('/v1/quizzes', params);
    },
    get: async (id: string): Promise<ApiResponse<any>> => {
      return this.get<ApiResponse<any>>(`/v1/quizzes/${encodeURIComponent(id)}`);
    },
  };

  /**
   * v1Quizzes Resource (RESTful v1 Authoring alias)
   */
  readonly v1Quizzes = {
    list: async (params?: Record<string, any>): Promise<ApiResponse<any[]>> => {
      return this.get<ApiResponse<any[]>>('/v1/quizzes', params);
    },
    get: async (id: string): Promise<ApiResponse<any>> => {
      return this.get<ApiResponse<any>>(`/v1/quizzes/${encodeURIComponent(id)}`);
    },
  };

  /**
   * Delivery Domain Resource (Candidate Quiz & Exam runtime execution)
   */
  readonly delivery = {
    /**
     * Lấy danh sách các đề thi/kỳ thi đã xuất bản
     */
    listQuizzes: async (_params?: { nodeId?: string; gradeNodeId?: string }): Promise<any[]> => {
      try {
        const response = await this.exams.list();
        return (response.data || []).map((exam) => ({
          id: exam.id,
          code: exam.code,
          title: exam.title,
          description: `Kỳ thi ${exam.code} (${exam.durationMinutes} phút)`,
          isPublic: exam.isPublished || exam.status === 'READY' || exam.status === 'ACTIVE',
          questionsCount: exam.variants?.[0]?.questionCount || 10,
          durationMinutes: exam.durationMinutes || 45,
          totalPoints: 10,
        }));
      } catch {
        return [];
      }
    },

    /**
     * Lấy chi tiết đề thi/kỳ thi
     */
    getQuizDetails: async (quizId: string) => {
      try {
        const response = await this.exams.get(quizId);
        const exam = response.data;
        if (!exam) return null;
        return {
          id: exam.id,
          code: exam.code,
          title: exam.title,
          description: `Kỳ thi ${exam.code} (${exam.durationMinutes} phút)`,
          durationMinutes: exam.durationMinutes || 45,
          totalPoints: 10,
          isPublic: exam.isPublished || exam.status === 'READY' || exam.status === 'ACTIVE',
          questionsCount: exam.variants?.[0]?.questionCount || 10,
        };
      } catch {
        return null;
      }
    },

    /**
     * Lấy cây phân loại tri thức / chủ đề cho thí sinh lọc đề thi
     */
    getTaxonomyTree: async (codeOrId: string = 'TOPIC') => {
      const response = await this.taxonomies.getTree(codeOrId);
      return response.data;
    },

    /**
     * Lấy danh sách các kỳ thi đã xuất bản
     */
    listExams: async (params?: { assessmentId?: string }): Promise<any[]> => {
      try {
        const response = await this.exams.list(params);
        return response.data || [];
      } catch {
        return [];
      }
    },

    /**
     * Bắt đầu hoặc khôi phục phiên làm bài theo chuẩn RESTful Delivery:
     * 1. POST /v1/attempts (Khởi tạo / resume attempt với examId hoặc quizId)
     * 2. POST /v1/attempts/:id/start (Kích hoạt tính giờ & nhận sanitized manifest)
     */
    startQuiz: async (
      quizOrExamId: string,
      optionsOrVariantCode?: string | { variantCode?: string; userId?: string },
      maybeUserId?: string
    ): Promise<CandidateStartQuizResponse> => {
      const variantCode = typeof optionsOrVariantCode === 'string'
        ? optionsOrVariantCode
        : optionsOrVariantCode?.variantCode;
      const userId = typeof optionsOrVariantCode === 'object' && optionsOrVariantCode !== null
        ? optionsOrVariantCode.userId ?? maybeUserId
        : maybeUserId;

      // 1. Tạo hoặc khôi phục attempt từ máy chủ
      const createRes: any = await this.attempts.createOrRecover({
        examId: quizOrExamId,
        quizId: quizOrExamId,
        variantCode,
        autoStart: true,
        userId,
      });
      const attempt = createRes.data;
      const initialManifest = createRes.manifest;

      // 2. Bắt đầu ca thi và nhận câu hỏi đã khử khuẩn cùng timing metadata
      let startedAttempt = attempt;
      let manifest = initialManifest;
      let rawQuestions = initialManifest?.questions || [];
      let serverTime = createRes.serverTime;
      let remainingSeconds: number | undefined;

      if (!initialManifest?.questions || initialManifest.questions.length === 0) {
        try {
          const startRes: any = await this.attempts.start(attempt.id, { userId });
          const startData = startRes.data || {};
          startedAttempt = startData.attempt || startData;
          manifest = startRes.manifest || startData.manifest;
          rawQuestions = startData.questions || manifest?.questions || [];
          serverTime = startRes.serverTime || startData.serverTime;
          if (startRes.remainingTimeMs !== undefined) {
            remainingSeconds = Math.round(startRes.remainingTimeMs / 1000);
          } else if (startData.remainingSeconds !== undefined) {
            remainingSeconds = startData.remainingSeconds;
          }
        } catch {
          // In case start was already performed by autoStart
        }
      }

      // Tự động đồng bộ mốc thời gian máy chủ trả về
      if (serverTime) {
        this.syncFromTimestamp(serverTime);
      }

      // 3. Chuẩn hóa câu hỏi theo CandidateQuestionDTO
      const questions: CandidateQuestionDTO[] = (rawQuestions || []).map((q: any) => {
        let type = q.type;
        if (type === 'single-choice' || type === 'true-false') type = 'SINGLE';
        else if (type === 'multiple-choice') type = 'MULTIPLE';
        else if (type === 'fill-in') type = 'FILL_IN';
        else if (type === 'matching') type = 'MATCHING';
        else if (type === 'ordering') type = 'ORDERING';
        else if (type === 'numeric') type = 'NUMERIC';

        const rawOptions = q.options || q.metadata?.options || (
          q.type === 'true-false'
            ? [
                { id: 'true', text: 'Đúng (True)' },
                { id: 'false', text: 'Sai (False)' },
              ]
            : []
        );

        const options = rawOptions.map((opt: any) => ({
          id: String(opt.id),
          content: opt.content || opt.text || String(opt),
        }));

        return {
          id: q.id,
          type: type as any,
          prompt: q.prompt,
          points: q.points,
          metadata: {
            ...q.metadata,
            options,
          },
        };
      });

      const session: CandidateSessionDTO = {
        id: startedAttempt.id,
        userId: startedAttempt.userId,
        quizId: startedAttempt.examId || startedAttempt.quizId || quizOrExamId,
        durationMinutes: manifest?.durationMinutes || manifest?.timeLimitMinutes || 15,
        status: startedAttempt.status,
        startedAt: startedAttempt.startedAt || new Date().toISOString(),
        deadline: startedAttempt.deadline || manifest?.deadline,
        submissionDeadline: startedAttempt.submissionDeadline,
        remainingSeconds: startedAttempt.remainingSeconds ?? remainingSeconds,
        serverTime: serverTime || startedAttempt.startedAt,
        answers: startedAttempt.answers || {},
      };

      return { session, questions };
    },

    /**
     * Nộp bài thi và nhận kết quả đánh giá theo chuẩn RESTful:
     * POST /v1/attempts/:id/submit
     */
    submitQuiz: async (payload: CandidateSubmitPayload): Promise<CandidateEvaluationResult> => {
      const res = await this.attempts.submit(payload.sessionId, {
        userId: payload.userId,
        answers: payload.answers,
      });
      const { scoreResult } = res.data;

      return {
        totalScoreAwarded: scoreResult.score,
        totalMaxScore: scoreResult.maxScore,
        percentage: scoreResult.percentage,
        isPassed: scoreResult.passed,
        details: scoreResult.breakdown,
      };
    },

    /**
     * Tự động truy vấn ca thi đang diễn ra của thí sinh (Auto-Discovery & Rehydration)
     */
    getActiveAttempt: async (userId?: string): Promise<AttemptDTO | null> => {
      return this.attempts.getActive(userId);
    },
  };

  get startQuiz() {
    return this.delivery.startQuiz;
  }

  get submitQuiz() {
    return this.delivery.submitQuiz;
  }

  get getActiveAttempt() {
    return this.delivery.getActiveAttempt;
  }
}

/**
 * Factory function tạo instance ApiClient với cấu hình linh hoạt
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
