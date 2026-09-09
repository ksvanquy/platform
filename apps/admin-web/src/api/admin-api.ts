import { apiClient, authClient } from './client.js';

export const adminApi = {
  /**
   * Kiểm tra tình trạng kết nối tới API Gateway
   */
  async checkHealth(): Promise<{ status: string; engine?: string; timestamp?: string }> {
    return apiClient.health();
  },

  /**
   * Lấy danh sách kỳ thi trong hệ thống (Exam Service)
   */
  async listExams() {
    const response = await apiClient.exams.list();
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

  /**
   * Ngân hàng câu hỏi (Question Bank, LaTeX, Media & Revisions)
   */
  questions: apiClient.questions,

  /**
   * Quản lý Bài đánh giá & Ma trận đề thi (Assessments & Blueprints)
   */
  assessments: apiClient.assessments,

  /**
   * Công cụ sinh & quản lý đề thi (Exam Engine, Randomization Seed & Variants)
   */
  exams: apiClient.exams,

  /**
   * Quản lý ca thi & Giám thị (Attempts & Proctoring Telemetry)
   */
  attempts: apiClient.attempts,
};
