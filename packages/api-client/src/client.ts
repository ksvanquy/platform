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
} from '@platform/contracts';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
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

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.defaultHeaders = config.headers ?? {};
    this.fetchFn = config.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
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
        throw new ApiClientError(errorMessage, response.status, responseData);
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
   * Quizzes API Domain Resource (RESTful v1 Authoring / Catalog)
   */
  readonly quizzes = {
    list: async (params?: { nodeId?: string; gradeNodeId?: string }): Promise<ApiResponse<any[]>> => {
      return this.get<ApiResponse<any[]>>('/v1/quizzes', params);
    },

    get: async (quizId: string): Promise<ApiResponse<any>> => {
      return this.get<ApiResponse<any>>(`/v1/quizzes/${quizId}`);
    },

    create: async (payload: {
      code: string;
      title: string;
      description?: string;
      isPublic?: boolean;
      primaryNodeId?: string | null;
      gradeNodeId?: string | null;
    }): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>('/v1/quizzes', payload);
    },

    update: async (
      quizId: string,
      payload: {
        title: string;
        description?: string;
        isPublic?: boolean;
        primaryNodeId?: string | null;
        gradeNodeId?: string | null;
      }
    ): Promise<ApiResponse<any>> => {
      return this.put<ApiResponse<any>>(`/v1/quizzes/${quizId}`, payload);
    },

    addVersion: async (quizId: string, payload: any): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/quizzes/${quizId}/versions`, payload);
    },

    publish: async (quizId: string, versionId: string): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/quizzes/${quizId}/publish`, { versionId });
    },
  };

  /**
   * Alias for v1Quizzes
   */
  readonly v1Quizzes = this.quizzes;

  /**
   * Attempts API Domain Resource (RESTful v1 Delivery)
   */
  readonly attempts = {
    create: async (quizId: string): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>('/v1/attempts', { quizId });
    },

    start: async (attemptId: string): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/attempts/${attemptId}/start`, {});
    },

    get: async (attemptId: string): Promise<ApiResponse<any>> => {
      return this.get<ApiResponse<any>>(`/v1/attempts/${attemptId}`);
    },

    recordAnswer: async (
      attemptId: string,
      questionId: string,
      payload: { answer: any; sequenceNumber?: number; clientTimestamp?: number }
    ): Promise<ApiResponse<any>> => {
      return this.put<ApiResponse<any>>(`/v1/attempts/${attemptId}/answers/${questionId}`, payload);
    },

    submit: async (attemptId: string): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>(`/v1/attempts/${attemptId}/submit`, {});
    },
  };

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
}

/**
 * Factory function tạo instance ApiClient với cấu hình linh hoạt
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
