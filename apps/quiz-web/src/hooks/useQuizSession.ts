import { useState, useRef, useCallback, useEffect } from 'react';
import { quizApi } from '../api/quiz-api.js';
import { apiClient, authClient } from '../api/client.js';
import { SessionDTO, QuestionDTO } from '../types/quiz.types.js';
import { EvaluationResult, ResultRevealPolicy } from '../types/scoring.types.js';

export type SaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

export const ACTIVE_SESSION_STORAGE_KEY = 'quiz_active_session_cache';

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

      const data = await quizApi.startQuiz(quizId, undefined, activeUserId);
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

      // Khử khuẩn và chuẩn hóa answers khi phục hồi từ backend (RCA 4)
      const cleanAnswers: Record<string, unknown> = {};
      sequenceMapRef.current.clear();

      if (normalizedSession.answers) {
        for (const [qId, rec] of Object.entries(normalizedSession.answers)) {
          if (rec && typeof rec === 'object' && 'answer' in (rec as any)) {
            cleanAnswers[qId] = (rec as any).answer;
            const seq = (rec as any).sequenceNumber ?? 1;
            sequenceMapRef.current.set(qId, seq);
          } else {
            cleanAnswers[qId] = rec;
            sequenceMapRef.current.set(qId, 1);
          }
        }
      }

      setAnswers(cleanAnswers);
      setResult(null);

      // Lưu trữ vết ca thi đang diễn ra vào localStorage (Mô-đun 2: Local Persistence)
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

      const targetUserId = session.userId || userId;
      const savePromise = quizApi.saveAnswer({
        sessionId: session.id,
        userId: targetUserId,
        questionId,
        answer: pending.value,
        sequenceNumber: pending.sequenceNumber,
      });

      inFlightSavesRef.current.add(savePromise);

      try {
        await savePromise;
        setSaveStatus('SAVED');
      } catch (err: any) {
        // Giai đoạn 2: Phát hiện ca thi đã kết thúc / đã nộp (ATTEMPT_ALREADY_FINALIZED) -> Dừng ngay vòng lặp autosave
        const isFinalizedConflict =
          err.status === 409 && (
            err.response?.errorCode === 'ATTEMPT_ALREADY_FINALIZED' ||
            err.errorCode === 'ATTEMPT_ALREADY_FINALIZED' ||
            err.response?.errorCode === 'ATTEMPT_ALREADY_SUBMITTED' ||
            err.errorCode === 'ATTEMPT_ALREADY_SUBMITTED'
          ) ||
          (typeof err.message === 'string' && (
            err.message.includes('already finalized') ||
            err.message.includes('already submitted') ||
            err.message.includes('cannot be modified')
          ));

        if (isFinalizedConflict) {
          saveTimerMapRef.current.forEach((t) => clearTimeout(t));
          saveTimerMapRef.current.clear();
          pendingSavesRef.current.clear();
          setSaveStatus('IDLE');
          setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));
          setErrorMessage('Bài thi đã hoàn tất hoặc đã được khóa trên máy chủ. Không thể tiếp tục cập nhật.');
          return;
        }

        // Giai đoạn 2: Xử lý ngoại lệ mất mạng / offline -> Giữ trong pending queue để tự động xả FIFO khi có mạng
        const isNetworkError =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          (typeof err.message === 'string' && (
            err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.message.includes('Network request failed')
          ));

        if (isNetworkError) {
          pendingSavesRef.current.set(questionId, pending);
          setSaveStatus('ERROR');
          setErrorMessage('Mất kết nối mạng. Đáp án đã được lưu tạm và sẽ tự động đồng bộ khi có mạng.');
          return;
        }

        // Giai đoạn 2: Tự động phục hồi khi gặp lỗi Sequence Conflict (HTTP 409 OUTDATED_ANSWER_SEQUENCE)
        const isSequenceConflict =
          err.status === 409 ||
          err.statusCode === 409 ||
          err.response?.errorCode === 'OUTDATED_ANSWER_SEQUENCE' ||
          err.errorCode === 'OUTDATED_ANSWER_SEQUENCE' ||
          (typeof err.message === 'string' && (
            err.message.includes('OUTDATED_ANSWER_SEQUENCE') ||
            err.message.includes('out-of-order') ||
            err.message.includes('older than current')
          ));

        if (isSequenceConflict) {
          // Trích xuất số sequence hiện tại của máy chủ nếu có trong message (vd: current #5)
          const match = typeof err.message === 'string' ? err.message.match(/current #(\d+)/) : null;
          const serverSeq = match ? parseInt(match[1], 10) : 0;
          const currentSeq = sequenceMapRef.current.get(questionId) || pending.sequenceNumber;
          const retrySeq = Math.max(currentSeq + 2, serverSeq + 1);
          sequenceMapRef.current.set(questionId, retrySeq);

          // Tự động retry lưu lại ngầm ngay lập tức với Sequence Number mới hơn
          try {
            await quizApi.saveAnswer({
              sessionId: session.id,
              userId: targetUserId,
              questionId,
              answer: pending.value,
              sequenceNumber: retrySeq,
            });
            setSaveStatus('SAVED');
          } catch (retryErr: any) {
            setSaveStatus('ERROR');
            setErrorMessage(retryErr.message || 'Lỗi lưu tiến độ bài thi');
          }
        } else {
          setSaveStatus('ERROR');
          setErrorMessage(err.message || 'Lỗi lưu tiến độ bài thi');
        }
      } finally {
        inFlightSavesRef.current.delete(savePromise);
      }
    }, 300);

    saveTimerMapRef.current.set(questionId, timer);
  }, [session?.id, session?.userId, userId]);

  /**
   * Giai đoạn 2: Xả Hàng đợi Autosave bằng Keepalive Fetch / Beacon API khi Trang bị Hủy hoặc Rời tab
   */
  const flushPendingAutosaves = useCallback(() => {
    if (!session?.id || pendingSavesRef.current.size === 0) return;

    // 1. Hủy bỏ toàn bộ debounce timers đang chờ
    saveTimerMapRef.current.forEach((t) => clearTimeout(t));
    saveTimerMapRef.current.clear();

    const baseUrl = apiClient.getBaseUrl ? apiClient.getBaseUrl() : '';
    const token = (authClient as any)?.session?.getAccessToken?.() || null;
    const targetUserId = session.userId || userId;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (targetUserId) {
      headers['X-User-Id'] = targetUserId;
    }

    for (const [qId, pending] of pendingSavesRef.current.entries()) {
      const payloadObj = {
        answer: pending.value,
        sequenceNumber: pending.sequenceNumber,
        clientTimestamp: Date.now(),
        userId: targetUserId,
      };
      const payloadStr = JSON.stringify(payloadObj);
      const endpoint = `${baseUrl}/v1/attempts/${encodeURIComponent(session.id)}/answers/${encodeURIComponent(qId)}`;

      let sent = false;

      // Ưu tiên 1: fetch với keepalive: true (Hỗ trợ chuẩn HTTP PUT & headers)
      if (typeof fetch !== 'undefined') {
        try {
          fetch(endpoint, {
            method: 'PUT',
            headers,
            body: payloadStr,
            keepalive: true,
          }).catch(() => {});
          sent = true;
        } catch {}
      }

      // Ưu tiên 2: navigator.sendBeacon fallback (Gửi POST vào endpoint /v1/attempts/:id/answers)
      if (!sent && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const beaconEndpoint = `${baseUrl}/v1/attempts/${encodeURIComponent(session.id)}/answers`;
          const beaconBlob = new Blob(
            [JSON.stringify({ ...payloadObj, questionId: qId })],
            { type: 'application/json' }
          );
          navigator.sendBeacon(beaconEndpoint, beaconBlob);
        } catch {}
      }
    }

    pendingSavesRef.current.clear();
  }, [session?.id, userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushPendingAutosaves();
      }
    };

    const handlePageHide = () => {
      flushPendingAutosaves();
    };

    const handleOnline = () => {
      if (pendingSavesRef.current.size > 0 && session?.id) {
        setSaveStatus('SAVING');
        const targetUserId = session.userId || userId;
        const tasks = Array.from(pendingSavesRef.current.entries());
        (async () => {
          for (const [qId, pending] of tasks) {
            try {
              await quizApi.saveAnswer({
                sessionId: session.id,
                userId: targetUserId,
                questionId: qId,
                answer: pending.value,
                sequenceNumber: pending.sequenceNumber,
              });
              pendingSavesRef.current.delete(qId);
            } catch (err: any) {
              console.warn('[QuizSession] Offline queue sync retry failed for', qId, err);
            }
          }
          if (pendingSavesRef.current.size === 0) {
            setSaveStatus('SAVED');
          }
        })();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('beforeunload', handlePageHide);
      window.addEventListener('online', handleOnline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('beforeunload', handlePageHide);
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [flushPendingAutosaves, session?.id, session?.userId, userId]);

  /**
   * Nộp bài thi: Flush toàn bộ debounced queue trước khi submit (Zero Data Loss)
   */
  const submit = useCallback(async (policy?: ResultRevealPolicy) => {
    if (!session?.id || isSubmitting) return;

    // Ngoại Biên 3: Flush toàn bộ hàng đợi Debounced Autosave Timers trước khi submit
    saveTimerMapRef.current.forEach((t) => clearTimeout(t));
    saveTimerMapRef.current.clear();

    const targetUserId = session.userId || userId;
    const flushPromises: Promise<any>[] = [];
    for (const [qId, pending] of pendingSavesRef.current.entries()) {
      const p = quizApi.saveAnswer({
        sessionId: session.id,
        userId: targetUserId,
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
        userId: targetUserId,
        policy,
      });
      setResult(evalResult);
      setSession((prev) => (prev ? { ...prev, status: 'SUBMITTED' } : null));

      // Dọn sạch active session cache sau khi nộp bài thành công
      try {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      } catch {}

      return evalResult;
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể nộp bài thi');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [session?.id, userId, isSubmitting]);

  const clearActiveSessionCache = useCallback(() => {
    try {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {}
  }, []);

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
    clearActiveSessionCache,
    flushPendingAutosaves,
  };
}
