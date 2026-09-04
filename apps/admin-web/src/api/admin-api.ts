import { apiClient } from './client.js';

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
};
