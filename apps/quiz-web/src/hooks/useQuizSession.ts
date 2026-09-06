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

  const sequenceMapRef = useRef<Map<string, number>>(new Map());
  const pendingSavesRef = useRef<Map<string, { value: unknown; sequenceNumber: number }>>(new Map());
  const saveTimerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inFlightSavesRef = useRef<Set<Promise<any>>>(new Set());

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

      const data = await quizApi.startQuiz(quizId);
      const rawSession: any = data.session;
      
      // Chuẩn hóa Session DTO (hỗ trợ cả getter hoặc private prefix từ backend)
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
      setAnswers(normalizedSession.answers || {});
      setResult(null);

      // Khởi tạo sequence map từ dữ liệu answers đã có
      if (normalizedSession.answers) {
        for (const [qId, rec] of Object.entries(normalizedSession.answers)) {
          const seq = (rec as any)?.sequenceNumber ?? 1;
          sequenceMapRef.current.set(qId, seq);
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      setErrorMessage(msg || 'Không thể bắt đầu bài thi. Vui lòng kiểm tra Backend server.');
      throw err;
    }
  }, [userId]);

  /**
   * Cập nhật câu trả lời với Optimistic UI, Monotonic Sequence Numbers & Debounced Autosave
   */
  const setAnswer = useCallback((questionId: string, value: unknown) => {
    // 1. Cập nhật State cục bộ tức thì
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    // 2. Tăng số thứ tự Sequence Number cục bộ cho câu hỏi này
    const nextSeq = (sequenceMapRef.current.get(questionId) || 0) + 1;
    sequenceMapRef.current.set(questionId, nextSeq);

    // 3. Ghi nhận dữ liệu mới nhất vào pending saves
    pendingSavesRef.current.set(questionId, { value, sequenceNumber: nextSeq });

    // 4. Debounce lưu lên Server
    const existingTimer = saveTimerMapRef.current.get(questionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setSaveStatus('SAVING');

    const timer = setTimeout(async () => {
      saveTimerMapRef.current.delete(questionId);
      const pending = pendingSavesRef.current.get(questionId);
      if (!session?.id || !pending) return;

      pendingSavesRef.current.delete(questionId);

      const savePromise = quizApi.saveAnswer({
        sessionId: session.id,
        userId,
        questionId,
        answer: pending.value,
        sequenceNumber: pending.sequenceNumber,
      });

      inFlightSavesRef.current.add(savePromise);

      try {
        await savePromise;
        setSaveStatus('SAVED');
      } catch (err: any) {
        setSaveStatus('ERROR');
        setErrorMessage(err.message || 'Lỗi lưu tiến độ bài thi');
      } finally {
        inFlightSavesRef.current.delete(savePromise);
      }
    }, 300);

    saveTimerMapRef.current.set(questionId, timer);
  }, [session?.id, userId]);

  /**
   * Nộp bài thi: Flush toàn bộ debounced queue trước khi submit (Zero Data Loss)
   */
  const submit = useCallback(async (policy?: ResultRevealPolicy) => {
    if (!session?.id || isSubmitting) return;

    // Ngoại Biên 3: Flush toàn bộ hàng đợi Debounced Autosave Timers trước khi submit
    saveTimerMapRef.current.forEach((t) => clearTimeout(t));
    saveTimerMapRef.current.clear();

    const flushPromises: Promise<any>[] = [];
    for (const [qId, pending] of pendingSavesRef.current.entries()) {
      const p = quizApi.saveAnswer({
        sessionId: session.id,
        userId,
        questionId: qId,
        answer: pending.value,
        sequenceNumber: pending.sequenceNumber,
      }).catch((err) => {
        console.warn(`[Autosave Flush] Warning: Failed to flush answer for ${qId}:`, err);
      });
      flushPromises.push(p);
    }
    pendingSavesRef.current.clear();

    // Chờ tất cả lưu ngầm hoàn tất để bảo đảm backend đã nhận đủ câu trả lời trước khi submit
    await Promise.all([...inFlightSavesRef.current, ...flushPromises]);

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
