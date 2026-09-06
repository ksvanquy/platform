import type { ApiResponse } from '@platform/contracts';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getTenantId?: () => string | null | undefined | Promise<string | null | undefined>;
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
  private currentTenantId: string | null = null;
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
   * Thiết lập thủ công Tenant ID cho client instance (X-Tenant-ID)
   */
  setTenantId(tenantId: string | null): void {
    this.currentTenantId = tenantId;
  }

  /**
   * Lấy giá trị Tenant ID hiện tại được cấu hình thủ công
   */
  getTenantIdValue(): string | null {
    return this.currentTenantId;
  }

  /**
   * Thực hiện HTTP request chung với xử lý tự động JWT token, Tenant header và lỗi
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

    // Note: Single-tenant mode: X-Tenant-ID header injection removed.

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
    list: async (): Promise<ApiResponse<any[]>> => {
      return this.get<ApiResponse<any[]>>('/v1/quizzes');
    },

    get: async (quizId: string): Promise<ApiResponse<any>> => {
      return this.get<ApiResponse<any>>(`/v1/quizzes/${quizId}`);
    },

    create: async (payload: { code: string; title: string; description?: string }): Promise<ApiResponse<any>> => {
      return this.post<ApiResponse<any>>('/v1/quizzes', payload);
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
}

/**
 * Factory function tạo instance ApiClient với cấu hình linh hoạt
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
