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
  readonly onExpire?: () => void;
}

/**
 * useServerCountdown Hook
 *
 * Tính năng chống gian lận & chịu lỗi cao (Zero-Trust Clock):
 * 1. Hoàn toàn MIỄN NHIỄM với Date.now() cục bộ: sử dụng Monotonic Anchor từ TimeSyncManager (performance.now()).
 * 2. Ưu tiên Server-Authoritative Deadline: Đọc trực tiếp deadline do server cấp thay vì tự suy diễn.
 * 3. Chống đóng băng Background/Tab-Sleep: Lắng nghe visibilitychange và focus để tự động bù giờ ngay khi mở lại tab.
 * 4. Tự động kích hoạt onExpire khi hết giờ chính thức của bài thi.
 */
export function useServerCountdown(
  startedAtOrOptions?: string | ServerCountdownOptions,
  durationMinutes?: number,
  onExpire?: () => void,
  explicitDeadline?: string
): CountdownState {
  // Chuẩn hóa tham số để hỗ trợ cả 2 dạng: (options) hoặc (startedAt, durationMinutes, onExpire, deadline)
  const isOptionsObject = typeof startedAtOrOptions === 'object' && startedAtOrOptions !== null;
  const startedAt = isOptionsObject ? startedAtOrOptions.startedAt : startedAtOrOptions;
  const duration = isOptionsObject ? startedAtOrOptions.durationMinutes : durationMinutes;
  const deadline = isOptionsObject ? startedAtOrOptions.deadline : explicitDeadline;
  const expireCallback = isOptionsObject ? startedAtOrOptions.onExpire : onExpire;

  const onExpireRef = useRef(expireCallback);
  onExpireRef.current = expireCallback;
  const expiredHandledRef = useRef(false);

  const timeSync = TimeSyncManager.getInstance();

  // Xác định mục tiêu hạn chót tính theo mốc thời gian máy chủ (ms)
  const getTargetDeadlineMs = useCallback((): number | null => {
    if (deadline) {
      const parsed = new Date(deadline).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    if (startedAt && duration) {
      const parsedStart = new Date(startedAt).getTime();
      if (!isNaN(parsedStart)) {
        return parsedStart + duration * 60 * 1000;
      }
    }
    return null;
  }, [deadline, startedAt, duration]);

  // Hàm tính toán số giây còn lại độc lập với Date.now() của OS
  const calculateRemainingSeconds = useCallback((): number => {
    const targetMs = getTargetDeadlineMs();
    if (targetMs === null) return 0;

    const currentServerTime = timeSync.getNow();
    const diffMs = targetMs - currentServerTime;
    return Math.max(0, Math.floor(diffMs / 1000));
  }, [getTargetDeadlineMs, timeSync]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => calculateRemainingSeconds());
  const [syncState, setSyncState] = useState(() => timeSync.getState());

  useEffect(() => {
    const targetMs = getTargetDeadlineMs();
    if (targetMs === null) {
      setRemainingSeconds(0);
      return;
    }

    // Reset cờ hết giờ nếu mục tiêu deadline thay đổi hoặc gia hạn
    expiredHandledRef.current = false;

    // Cập nhật ngay lập tức
    const initialSeconds = calculateRemainingSeconds();
    setRemainingSeconds(initialSeconds);
    setSyncState(timeSync.getState());

    if (initialSeconds <= 0 && !expiredHandledRef.current) {
      expiredHandledRef.current = true;
      onExpireRef.current?.();
      return;
    }

    // Tick định kỳ bằng Timer Monotonic (chạy ở tần số 500ms để bắt giây nhạy hơn)
    const interval = setInterval(() => {
      const currentSeconds = calculateRemainingSeconds();
      setRemainingSeconds((prev) => {
        if (prev !== currentSeconds) {
          return currentSeconds;
        }
        return prev;
      });

      if (currentSeconds <= 0) {
        clearInterval(interval);
        if (!expiredHandledRef.current) {
          expiredHandledRef.current = true;
          onExpireRef.current?.();
        }
      }
    }, 500);

    // Xử lý sự cố trình duyệt đóng băng (Mobile Backgrounding, Tab Throttling, Sleep Mode)
    const handleWakeupOrFocus = () => {
      const updatedSeconds = calculateRemainingSeconds();
      setRemainingSeconds(updatedSeconds);
      setSyncState(timeSync.getState());

      if (updatedSeconds <= 0 && !expiredHandledRef.current) {
        expiredHandledRef.current = true;
        onExpireRef.current?.();
      }

      // Kích hoạt đồng bộ nhẹ với server nếu tab vừa thức dậy
      if (document.visibilityState === 'visible') {
        timeSync.syncIfNeeded(30000).then(() => {
          setSyncState(timeSync.getState());
        });
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleWakeupOrFocus);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleWakeupOrFocus);
      window.addEventListener('online', handleWakeupOrFocus);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleWakeupOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWakeupOrFocus);
        window.removeEventListener('online', handleWakeupOrFocus);
      }
    };
  }, [getTargetDeadlineMs, calculateRemainingSeconds, timeSync]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    formattedTime,
    remainingSeconds,
    isExpired: remainingSeconds <= 0 && getTargetDeadlineMs() !== null,
    isWarning: remainingSeconds > 0 && remainingSeconds <= 120, // < 2 phút
    isCritical: remainingSeconds > 0 && remainingSeconds <= 30, // < 30 giây
    serverTimeEst: timeSync.getNow(),
    isSynchronized: syncState.isSynchronized,
  };
}
