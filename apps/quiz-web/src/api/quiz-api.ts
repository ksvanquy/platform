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
   * Lấy danh sách các đề thi/kỳ thi đã xuất bản (Exam Service qua Gateway)
   */
  async listQuizzes(_params?: { nodeId?: string; gradeNodeId?: string }): Promise<any[]> {
    try {
      const response = await apiClient.exams.list();
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
   * Lấy chi tiết đề thi/kỳ thi và phiên bản xuất bản hiện tại
   */
  async getQuizDetails(quizId: string) {
    try {
      const response = await apiClient.exams.get(quizId);
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
  async getTaxonomyTree(codeOrId: string = 'TOPIC') {
    const response = await apiClient.taxonomies.getTree(codeOrId);
    return response.data;
  },

  /**
   * Lấy danh sách các kỳ thi đã xuất bản (Exam Service)
   */
  async listExams(params?: { assessmentId?: string }): Promise<any[]> {
    try {
      const response = await apiClient.exams.list(params);
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
  async startQuiz(quizOrExamId: string, variantCode?: string, userId?: string): Promise<StartQuizResponse['data']> {
    // 1. Tạo hoặc khôi phục attempt từ máy chủ
    const createRes: any = await apiClient.attempts.createOrRecover({
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
        const startRes: any = await apiClient.attempts.start(attempt.id, { userId });
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
   * Ghi nhận sự kiện giám thị / chống gian lận (Anti-Cheat Telemetry Audit)
   */
  async recordEvent(
    attemptId: string,
    event: { eventType: string; metadata?: Record<string, unknown>; clientTimestamp?: string }
  ) {
    try {
      const res = await apiClient.attempts.recordEvent(attemptId, {
        eventType: event.eventType as any,
        metadata: event.metadata,
        clientTimestamp: event.clientTimestamp || new Date().toISOString(),
      });
      return res.data;
    } catch {
      return null;
    }
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
        userId: payload.userId,
      } as any
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
    const res = await apiClient.attempts.submit(payload.sessionId, {
      userId: payload.userId,
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
};
