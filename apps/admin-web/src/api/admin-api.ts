import { apiClient } from './client.js';

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
   * Đã chuẩn hóa qua apiClient: tự động kèm Bearer token, silent refresh và base URL
   */
  async listUsers() {
    const response = await apiClient.users.list();
    return response.data || [];
  },

  /**
   * Cập nhật trạng thái Khóa / Mở khóa tài khoản (Active / Deactivated - Protected Admin Endpoint)
   * Đã chuẩn hóa qua apiClient: an toàn trên production và xử lý lỗi tập trung
   */
  async updateUserStatus(userId: string, isActive: boolean) {
    return await apiClient.users.updateStatus(userId, isActive);
  },

  /**
   * Quản lý người dùng hệ thống (Resource trực tiếp từ ApiClient)
   */
  users: apiClient.users,

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
