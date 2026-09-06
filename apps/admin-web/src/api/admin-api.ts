import { apiClient, authClient } from './client.js';

export const adminApi = {
  /**
   * Kiểm tra tình trạng kết nối tới Quiz Core API
   */
  async checkHealth(): Promise<{ status: string; engine?: string; timestamp?: string }> {
    return apiClient.health();
  },

  /**
   * Lấy chi tiết bài thi theo ID với đầy đủ cấu trúc câu hỏi
   */
  async getQuiz(quizId: string) {
    const response = await apiClient.quizzes.get(quizId);
    return response.data;
  },

  /**
   * Lấy danh sách đề thi hiện có trong hệ thống
   */
  async listQuizzes(params?: { nodeId?: string }) {
    const response = await apiClient.quizzes.list(params);
    return response.data;
  },

  /**
   * Tạo đề thi mới
   */
  async createQuiz(payload: {
    code: string;
    title: string;
    description?: string;
    isPublic?: boolean;
    primaryNodeId?: string | null;
  }) {
    const response = await apiClient.quizzes.create(payload);
    return response.data;
  },

  /**
   * Cập nhật thông tin đề thi và gán chủ đề / node tri thức
   */
  async updateQuiz(
    quizId: string,
    payload: {
      title: string;
      description?: string;
      isPublic?: boolean;
      primaryNodeId?: string | null;
    }
  ) {
    const response = await apiClient.quizzes.update(quizId, payload);
    return response.data;
  },

  /**
   * Lấy danh sách người dùng trong hệ thống (Auth Service - Protected Admin Endpoint)
   */
  async listUsers() {
    const token = await authClient.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch('/v1/auth/users', { headers });
    const result = await response.json();
    return result.data || [];
  },

  /**
   * Cập nhật trạng thái Khóa / Mở khóa tài khoản (Active / Deactivated - Protected Admin Endpoint)
   */
  async updateUserStatus(userId: string, isActive: boolean) {
    const token = await authClient.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`/v1/auth/users/${userId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive }),
    });
    return await response.json();
  },

  /**
   * Quản lý Danh mục và Cây tri thức (Taxonomy & Knowledge Catalog)
   */
  taxonomies: apiClient.taxonomies,
};
