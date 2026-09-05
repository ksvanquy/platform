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
  async listQuizzes() {
    const response = await apiClient.quizzes.list();
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
};
