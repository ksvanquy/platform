import { useState, useRef, useCallback } from 'react';
import { quizApi } from '../api/quiz-api.js';
import { SessionDTO, QuestionDTO } from '../types/quiz.types.js';
import { EvaluationResult, ResultRevealPolicy } from '../types/scoring.types.js';

export type SaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

export function useQuizSession(initialUserId: string = 'candidate_demo') {
  const [userId, setUserId] = useState<string>(initialUserId);
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [questions, setQuestions] = useState<readonly QuestionDTO[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('IDLE');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const saveTimerMapRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  /**
   * Bắt đầu một bài thi mới
   */
  const start = useCallback(async (quizId: string, customUserId?: string) => {
    try {
      setErrorMessage(null);
      const activeUserId = customUserId?.trim() || userId;
      if (customUserId?.trim()) {
        setUserId(customUserId.trim());
      }

      const data = await quizApi.startQuiz(quizId, activeUserId);
      const rawSession: any = data.session;
      
      // Chuẩn hóa Session DTO (hỗ trợ cả getter hoặc private prefix từ backend)
      const normalizedSession: SessionDTO = {
        id: rawSession.id,
        userId: rawSession.userId || activeUserId,
        quizId: rawSession.quizId || quizId,
        durationMinutes: rawSession.durationMinutes || 15,
        status: rawSession.status || rawSession._status || 'IN_PROGRESS',
        startedAt: rawSession.startedAt || rawSession._startedAt || new Date().toISOString(),
        answers: rawSession.answers || rawSession._answers || {},
      };

      setSession(normalizedSession);
      setQuestions(data.questions || []);
      setAnswers(normalizedSession.answers || {});
      setResult(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể bắt đầu bài thi. Vui lòng kiểm tra Backend server.');
      throw err;
    }
  }, [userId]);

  /**
   * Cập nhật câu trả lời với Optimistic UI & Debounced Autosave
   */
  const setAnswer = useCallback((questionId: string, value: unknown) => {
    // 1. Cập nhật State cục bộ tức thì
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    // 2. Debounce lưu lên Server
    const existingTimer = saveTimerMapRef.current.get(questionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setSaveStatus('SAVING');

    const timer = setTimeout(async () => {
      saveTimerMapRef.current.delete(questionId);
      if (!session?.id) return;

      try {
        await quizApi.saveAnswer({
          sessionId: session.id,
          userId,
          questionId,
          answer: value,
        });
        setSaveStatus('SAVED');
      } catch (err: any) {
        setSaveStatus('ERROR');
        setErrorMessage(err.message || 'Lỗi lưu tiến độ bài thi');
      }
    }, 300);

    saveTimerMapRef.current.set(questionId, timer);
  }, [session?.id, userId]);

  /**
   * Nộp bài thi
   */
  const submit = useCallback(async (policy?: ResultRevealPolicy) => {
    if (!session?.id || isSubmitting) return;

    // Xóa tất cả debounced timers đang chờ và flush
    saveTimerMapRef.current.forEach((t) => clearTimeout(t));
    saveTimerMapRef.current.clear();

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const evalResult = await quizApi.submitQuiz({
        sessionId: session.id,
        userId,
        policy,
      });
      setResult(evalResult);
      setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));
      return evalResult;
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể nộp bài thi');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [session?.id, userId, isSubmitting]);

  return {
    userId,
    session,
    questions,
    answers,
    saveStatus,
    isSubmitting,
    result,
    errorMessage,
    start,
    setAnswer,
    submit,
  };
}
