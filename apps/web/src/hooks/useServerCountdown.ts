import { useState, useEffect, useRef, useCallback } from 'react';
import { TimeSyncManager } from '../utils/TimeSyncManager.js';

export interface CountdownState {
  readonly formattedTime: string;
  readonly remainingSeconds: number;
  readonly isExpired: boolean;
  readonly isWarning: boolean;
  readonly isCritical: boolean;
  readonly serverTimeEst: number;
  readonly isSynchronized: boolean;
}

export interface ServerCountdownOptions {
  readonly startedAt?: string;
  readonly durationMinutes?: number;
  readonly deadline?: string;
  readonly submissionDeadline?: string;
  readonly remainingSeconds?: number;
  readonly onExpire?: () => void;
}

/**
 * useServerCountdown Hook (Simplified)
 *
 * Cơ chế đếm ngược tinh gọn:
 * 1. Khởi tạo từ deadline (ISO String) hoặc remainingSeconds do Server trả về.
 * 2. Đếm ngược định kỳ mỗi giây (setInterval 1000ms).
 * 3. Tự động đồng bộ lại khi quay lại tab (visibilitychange/focus) tránh bị lệch giờ khi máy tính sleep.
 * 4. Kích hoạt onExpire() khi hết giờ.
 */
export function useServerCountdown(
  startedAtOrOptions?: string | ServerCountdownOptions,
  durationMinutes?: number,
  onExpire?: () => void,
  explicitDeadline?: string
): CountdownState {
  const isOptionsObject = typeof startedAtOrOptions === 'object' && startedAtOrOptions !== null;
  const startedAt = isOptionsObject ? startedAtOrOptions.startedAt : startedAtOrOptions;
  const duration = isOptionsObject ? startedAtOrOptions.durationMinutes : durationMinutes;
  const deadline = isOptionsObject ? startedAtOrOptions.deadline : explicitDeadline;
  const initialRemaining = isOptionsObject ? startedAtOrOptions.remainingSeconds : undefined;
  const expireCallback = isOptionsObject ? startedAtOrOptions.onExpire : onExpire;

  const onExpireRef = useRef(expireCallback);
  onExpireRef.current = expireCallback;
  const expiredHandledRef = useRef(false);

  const timeSync = TimeSyncManager.getInstance();

  // Tính toán số giây còn lại
  const calculateRemainingSeconds = useCallback((): number => {
    if (deadline) {
      const deadlineMs = new Date(deadline).getTime();
      if (!isNaN(deadlineMs)) {
        const now = timeSync.getNow();
        return Math.max(0, Math.floor((deadlineMs - now) / 1000));
      }
    }
    if (startedAt && duration) {
      const startMs = new Date(startedAt).getTime();
      if (!isNaN(startMs)) {
        const deadlineMs = startMs + duration * 60 * 1000;
        const now = timeSync.getNow();
        return Math.max(0, Math.floor((deadlineMs - now) / 1000));
      }
    }
    if (typeof initialRemaining === 'number') {
      return Math.max(0, initialRemaining);
    }
    if (duration) {
      return duration * 60;
    }
    return 0;
  }, [deadline, startedAt, duration, initialRemaining, timeSync]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => calculateRemainingSeconds());

  useEffect(() => {
    expiredHandledRef.current = false;
    const initial = calculateRemainingSeconds();
    setRemainingSeconds(initial);

    if (initial <= 0 && (deadline || startedAt)) {
      expiredHandledRef.current = true;
      onExpireRef.current?.();
      return;
    }

    // Đếm ngược mỗi 1 giây
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 0 && !expiredHandledRef.current) {
          expiredHandledRef.current = true;
          onExpireRef.current?.();
        }
        return next;
      });
    }, 1000);

    // Khi thí sinh mở lại tab sau khi sleep/chuyển tab, đồng bộ lại từ deadline
    const handleFocus = () => {
      const refreshed = calculateRemainingSeconds();
      setRemainingSeconds(refreshed);
      if (refreshed <= 0 && !expiredHandledRef.current) {
        expiredHandledRef.current = true;
        onExpireRef.current?.();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleFocus);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [deadline, startedAt, duration, calculateRemainingSeconds]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    formattedTime,
    remainingSeconds,
    isExpired: remainingSeconds <= 0 && (Boolean(deadline) || Boolean(startedAt)),
    isWarning: remainingSeconds > 0 && remainingSeconds <= 120, // < 2 phút
    isCritical: remainingSeconds > 0 && remainingSeconds <= 30, // < 30 giây
    serverTimeEst: timeSync.getNow(),
    isSynchronized: timeSync.getState().isSynchronized,
  };
}
