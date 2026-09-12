import { useState, useCallback, useEffect } from 'react';
import { quizApi } from '../api/index.js';
import { SessionDTO, QuestionDTO } from '../types/quiz.types.js';
import { EvaluationResult, ResultRevealPolicy } from '../types/scoring.types.js';
import {
  AnswerStorageManager,
  ACTIVE_SESSION_STORAGE_KEY,
  ANSWERS_STORAGE_KEY_PREFIX,
} from '../utils/AnswerStorageManager.js';

export { ACTIVE_SESSION_STORAGE_KEY, ANSWERS_STORAGE_KEY_PREFIX };

export function useQuizSession(initialUserId: string = 'candidate_demo') {
  const [userId, setUserId] = useState<string>(initialUserId);
  const [session, setSession] = useState<SessionDTO | null>(null);

  useEffect(() => {
    if (initialUserId && initialUserId !== userId) {
      setUserId(initialUserId);
    }
  }, [initialUserId]);

  const [questions, setQuestions] = useState<readonly QuestionDTO[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Đồng bộ đa tab trong thời gian thực (Multi-tab Real-time Sync):
   * Tự động phản chiếu mọi thay đổi câu trả lời hoặc trạng thái nộp bài từ các tab khác.
   */
  useEffect(() => {
    if (!session?.id) return;

    const unsubscribe = AnswerStorageManager.subscribe(session.id, (event) => {
      if (event.type === 'ANSWERS_UPDATED') {
        setAnswers(event.answers);
      } else if (event.type === 'SESSION_SUBMITTED') {
        setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));
        setAnswers({});
      } else if (event.type === 'SESSION_CLEARED') {
        setAnswers({});
      }
    });

    return unsubscribe;
  }, [session?.id]);

  /**
   * Bắt đầu một bài thi mới hoặc phục hồi bài thi hiện tại
   */
  const start = useCallback(async (quizId: string, customUserId?: string) => {
    try {
      setErrorMessage(null);
      const activeUserId = customUserId?.trim() || userId;
      if (customUserId?.trim()) {
        setUserId(customUserId.trim());
      }

      const data = await quizApi.startQuiz(quizId, undefined, activeUserId);
      const rawSession: any = data.session;
      
      // Chuẩn hóa Session DTO
      const normalizedSession: SessionDTO = {
        id: rawSession.id,
        userId: rawSession.userId || activeUserId,
        quizId: rawSession.quizId || quizId,
        durationMinutes: rawSession.durationMinutes || 15,
        status: rawSession.status || rawSession._status || 'IN_PROGRESS',
        startedAt: rawSession.startedAt || rawSession._startedAt || new Date().toISOString(),
        deadline: rawSession.deadline || rawSession._deadline,
        submissionDeadline: rawSession.submissionDeadline || rawSession._submissionDeadline,
        remainingSeconds: rawSession.remainingSeconds,
        serverTime: rawSession.serverTime,
        answers: rawSession.answers || rawSession._answers || {},
      };

      setSession(normalizedSession);
      setQuestions(data.questions || []);

      // 1. Lấy và khử khuẩn answers từ backend session nếu có
      const serverAnswers = AnswerStorageManager.sanitizeAnswers(normalizedSession.answers);

      // 2. Lấy answers đã lưu trong localStorage (nếu có bản backup offline / đa tab trước đó)
      const localAnswers = AnswerStorageManager.getAnswers(normalizedSession.id);

      // 3. Hợp nhất cả hai nguồn ưu tiên dữ liệu mới hơn và lưu lại vào StorageManager
      const initialAnswers = AnswerStorageManager.saveAllAnswers(normalizedSession.id, {
        ...serverAnswers,
        ...localAnswers,
      });

      setAnswers(initialAnswers);
      setResult(null);

      // Lưu vết ca thi đang diễn ra vào localStorage
      try {
        localStorage.setItem(
          ACTIVE_SESSION_STORAGE_KEY,
          JSON.stringify({
            sessionId: normalizedSession.id,
            quizId: normalizedSession.quizId,
            userId: normalizedSession.userId,
            deadline: normalizedSession.deadline,
            startedAt: normalizedSession.startedAt,
            status: normalizedSession.status,
          })
        );
      } catch (e) {
        console.warn('[QuizSession] Không thể lưu cache ca thi:', e);
      }
    } catch (err: any) {
      const msg = err.message || '';
      setErrorMessage(msg || 'Không thể bắt đầu bài thi. Vui lòng kiểm tra Backend server.');
      throw err;
    }
  }, [userId]);

  /**
   * Cập nhật câu trả lời:
   * Áp dụng Atomic Read-Merge-Write qua AnswerStorageManager, loại bỏ triệt để stale overwrite
   * giữa nhiều tab đang cùng mở làm bài.
   */
  const setAnswer = useCallback((questionId: string, value: unknown) => {
    if (session?.id) {
      const updatedAnswers = AnswerStorageManager.saveAnswer(session.id, questionId, value);
      setAnswers(updatedAnswers);
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }
  }, [session?.id]);

  /**
   * Nộp bài thi: Gửi toàn bộ bảng câu trả lời trong một request duy nhất
   */
  const submit = useCallback(async (policy?: ResultRevealPolicy) => {
    if (!session?.id || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetUserId = session.userId || userId;

    // Đảm bảo lấy snapshot câu trả lời mới nhất từ cả storage và memory
    const latestAnswers = {
      ...AnswerStorageManager.getAnswers(session.id),
      ...answers,
    };

    try {
      const evalResult = await quizApi.submitQuiz({
        sessionId: session.id,
        userId: targetUserId,
        answers: latestAnswers,
        policy,
      });
      setResult(evalResult);
      setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));

      // Dọn sạch session cache và đồng bộ tới tất cả các tab khác
      AnswerStorageManager.notifySubmitted(session.id);

      return evalResult;
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể nộp bài thi');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [session?.id, userId, answers, isSubmitting]);

  const clearActiveSessionCache = useCallback(() => {
    try {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      if (session?.id) {
        AnswerStorageManager.clearAnswers(session.id);
      }
    } catch {}
  }, [session?.id]);

  return {
    userId,
    session,
    questions,
    answers,
    isSubmitting,
    result,
    errorMessage,
    start,
    setAnswer,
    submit,
    clearActiveSessionCache,
  };
}

  return {
    userId,
    session,
    questions,
    answers,
    isSubmitting,
    result,
    errorMessage,
    start,
    setAnswer,
    submit,
    clearActiveSessionCache,
  };
}
