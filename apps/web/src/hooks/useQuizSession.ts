import { useState, useCallback, useEffect } from 'react';
import { quizApi } from '../api/index.js';
import { SessionDTO, QuestionDTO } from '../types/quiz.types.js';
import { EvaluationResult, ResultRevealPolicy } from '../types/scoring.types.js';

export const ACTIVE_SESSION_STORAGE_KEY = 'quiz_active_session_cache';
export const ANSWERS_STORAGE_KEY_PREFIX = 'quiz_answers_';

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

      // Khôi phục answers từ backend session nếu có
      const cleanAnswers: Record<string, unknown> = {};

      if (normalizedSession.answers) {
        for (const [qId, rec] of Object.entries(normalizedSession.answers)) {
          if (rec && typeof rec === 'object' && 'answer' in (rec as any)) {
            cleanAnswers[qId] = (rec as any).answer;
          } else {
            cleanAnswers[qId] = rec;
          }
        }
      }

      // Khôi phục answers từ localStorage nếu có bản backup cục bộ mới hơn
      try {
        const localSaved = localStorage.getItem(`${ANSWERS_STORAGE_KEY_PREFIX}${normalizedSession.id}`);
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          if (parsed && typeof parsed === 'object') {
            Object.assign(cleanAnswers, parsed);
          }
        }
      } catch (e) {
        console.warn('[QuizSession] Không thể đọc localStorage answers:', e);
      }

      setAnswers(cleanAnswers);
      setResult(null);

      // Lưu trữ vết ca thi đang diễn ra vào localStorage
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
   * Cập nhật câu trả lời trong bộ nhớ client + lưu backup tức thì vào localStorage
   */
  const setAnswer = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (session?.id) {
        try {
          localStorage.setItem(`${ANSWERS_STORAGE_KEY_PREFIX}${session.id}`, JSON.stringify(next));
        } catch (e) {
          console.warn('[QuizSession] Không thể ghi backup answers vào localStorage:', e);
        }
      }
      return next;
    });
  }, [session?.id]);

  /**
   * Nộp bài thi: Gửi toàn bộ bảng câu trả lời trong một request duy nhất
   */
  const submit = useCallback(async (policy?: ResultRevealPolicy) => {
    if (!session?.id || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetUserId = session.userId || userId;

    try {
      const evalResult = await quizApi.submitQuiz({
        sessionId: session.id,
        userId: targetUserId,
        answers,
        policy,
      });
      setResult(evalResult);
      setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));

      // Dọn sạch session cache và local answers sau khi nộp bài thành công
      try {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        localStorage.removeItem(`${ANSWERS_STORAGE_KEY_PREFIX}${session.id}`);
      } catch {}

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
        localStorage.removeItem(`${ANSWERS_STORAGE_KEY_PREFIX}${session.id}`);
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
