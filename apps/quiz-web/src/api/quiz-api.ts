import { apiClient } from './client.js';
import {
  StartQuizResponse,
  SaveAnswerPayload,
  SaveAnswerResponse,
  QuestionDTO,
  SessionDTO,
} from '../types/quiz.types.js';
import {
  SubmitQuizPayload,
  SubmitQuizResponse,
} from '../types/scoring.types.js';
import { TimeSyncManager } from '../utils/TimeSyncManager.js';

export const quizApi = {
  /**
   * Lấy danh sách các đề thi đã xuất bản từ RESTful API (/v1/quizzes)
   */
  async listQuizzes(): Promise<any[]> {
    const response = await apiClient.quizzes.list();
    return response.data || [];
  },

  /**
   * Bắt đầu hoặc khôi phục phiên làm bài theo chuẩn RESTful Delivery:
   * 1. POST /v1/attempts (Khởi tạo / resume attempt với quizId)
   * 2. POST /v1/attempts/:id/start (Kích hoạt tính giờ & nhận sanitized manifest)
   */
  async startQuiz(quizId: string, _legacyUserId?: string): Promise<StartQuizResponse['data']> {
    // 1. Tạo hoặc khôi phục attempt từ máy chủ
    const createRes = await apiClient.attempts.create(quizId);
    const attempt = createRes.data;

    // 2. Bắt đầu ca thi và nhận câu hỏi đã khử khuẩn cùng timing metadata
    const startRes = await apiClient.attempts.start(attempt.id);
    const {
      attempt: startedAttempt,
      questions: rawQuestions,
      manifest,
      serverTime,
      remainingSeconds,
    } = startRes.data;

    // Đồng bộ đồng hồ với mốc thời gian máy chủ trả về
    if (serverTime) {
      TimeSyncManager.getInstance().syncFromTimestamp(new Date(serverTime).getTime());
    } else {
      // Thực hiện đồng bộ nền qua endpoint /v1/time
      TimeSyncManager.getInstance().syncWithServer().catch(() => {});
    }

    // 3. Chuẩn hóa câu hỏi theo QuestionDTO của web client
    const questions: QuestionDTO[] = (rawQuestions || []).map((q: any) => {
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

    const session: SessionDTO = {
      id: startedAttempt.id,
      userId: startedAttempt.userId,
      quizId: startedAttempt.quizId,
      durationMinutes: manifest?.timeLimitMinutes || 15,
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
   * Tự động lưu tiến độ câu trả lời theo chuẩn RESTful:
   * PUT /v1/attempts/:id/answers/:questionId kèm sequenceNumber (BƯỚC 4) để chống ghi đè khi mạng trễ
   */
  async saveAnswer(payload: SaveAnswerPayload): Promise<SaveAnswerResponse> {
    const timeSync = TimeSyncManager.getInstance();
    const res = await apiClient.attempts.recordAnswer(
      payload.sessionId,
      payload.questionId,
      {
        answer: payload.answer,
        sequenceNumber: payload.sequenceNumber,
        clientTimestamp: timeSync.getNow(),
      }
    );
    return {
      success: true,
      message: res.message || 'Answer recorded successfully',
    };
  },

  /**
   * Nộp bài thi và nhận kết quả đánh giá theo chuẩn RESTful:
   * POST /v1/attempts/:id/submit
   */
  async submitQuiz(payload: SubmitQuizPayload): Promise<SubmitQuizResponse['data']> {
    const res = await apiClient.attempts.submit(payload.sessionId);
    const { scoreResult } = res.data;

    return {
      totalScoreAwarded: scoreResult.score,
      totalMaxScore: scoreResult.maxScore,
      percentage: scoreResult.percentage,
      isPassed: scoreResult.passed,
      details: scoreResult.breakdown,
    };
  },
};
