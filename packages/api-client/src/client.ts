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
  AntiCheatEventDTO,
  RecordAntiCheatEventInput,
  SubmitAttemptInput,
} from '@platform/contracts';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
  onUnauthorized?: (error: ApiClientError) => void;
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

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.defaultHeaders = config.headers ?? {};
    this.fetchFn = config.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
    this.onUnauthorized = config.onUnauthorized;
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
    list: async (params?: { examId?: string; studentId?: string; status?: string }): Promise<ApiResponse<AttemptDTO[]>> => {
      return this.get<ApiResponse<AttemptDTO[]>>('/v1/attempts', params);
    },

    /**
     * Tự động lưu đáp án câu hỏi với Sequence Protection (<25ms SLA)
     */
    recordAnswer: async (
      attemptId: string,
      questionId: string,
      payload: { answer: any; sequenceNumber?: number; clientTimestamp?: number }
    ): Promise<ApiResponse<any>> => {
      return this.put<ApiResponse<any>>(
        `/v1/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(questionId)}`,
        payload
      );
    },

    /**
     * Alias chuyên biệt cho autosave
     */
    autosave: async (
      attemptId: string,
      questionId: string,
      payload: { answer: any; sequenceNumber: number; clientTimestamp?: number }
    ): Promise<ApiResponse<{ success: boolean; sequenceNumber: number; savedAt: string }>> => {
      return this.put<ApiResponse<{ success: boolean; sequenceNumber: number; savedAt: string }>>(
        `/v1/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(questionId)}`,
        payload
      );
    },

    /**
     * Ghi nhận sự kiện telemetry chống gian lận (rời tab, thoát toàn màn hình, paste...)
     */
    recordEvent: async (
      attemptId: string,
      payload: RecordAntiCheatEventInput
    ): Promise<ApiResponse<AntiCheatEventDTO>> => {
      return this.post<ApiResponse<AntiCheatEventDTO>>(
        `/v1/attempts/${encodeURIComponent(attemptId)}/events`,
        payload
      );
    },

    /**
     * Lấy danh sách nhật ký kiểm toán telemetry của ca thi
     */
    listEvents: async (attemptId: string): Promise<ApiResponse<AntiCheatEventDTO[]>> => {
      return this.get<ApiResponse<AntiCheatEventDTO[]>>(`/v1/attempts/${encodeURIComponent(attemptId)}/events`);
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
  };

  /**
   * Đồng bộ đồng hồ máy chủ với thuật toán Cristian's Algorithm
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
    const rttMs = Math.max(0, t3 - t1);
    const serverTimestampMs = res.timestampMs ?? new Date(res.serverTime).getTime();
    const estimatedServerNow = serverTimestampMs + Math.round(rttMs / 2);
    const clockOffsetMs = estimatedServerNow - t3;

    return {
      serverTime: res.serverTime,
      serverTimestampMs,
      rttMs,
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
}

/**
 * Factory function tạo instance ApiClient với cấu hình linh hoạt
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
