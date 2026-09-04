import { useState, useEffect, useRef } from 'react';

export interface CountdownState {
  readonly formattedTime: string;
  readonly remainingSeconds: number;
  readonly isExpired: boolean;
  readonly isWarning: boolean;
  readonly isCritical: boolean;
}

export function useServerCountdown(
  startedAt: string | undefined,
  durationMinutes: number | undefined,
  onExpire?: () => void
): CountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!startedAt || !durationMinutes) return 0;
    const startTime = new Date(startedAt).getTime();
    const expireTime = startTime + durationMinutes * 60 * 1000;
    const diff = Math.max(0, Math.floor((expireTime - Date.now()) / 1000));
    return diff;
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredHandledRef = useRef(false);

  useEffect(() => {
    if (!startedAt || !durationMinutes) return;

    const calculateRemaining = () => {
      const startTime = new Date(startedAt).getTime();
      const expireTime = startTime + durationMinutes * 60 * 1000;
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expireTime - now) / 1000));
      return diff;
    };

    // Khởi tạo ngay lập tức
    const initial = calculateRemaining();
    setRemainingSeconds(initial);

    if (initial <= 0 && !expiredHandledRef.current) {
      expiredHandledRef.current = true;
      onExpireRef.current?.();
      return;
    }

    const interval = setInterval(() => {
      const secondsLeft = calculateRemaining();
      setRemainingSeconds(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(interval);
        if (!expiredHandledRef.current) {
          expiredHandledRef.current = true;
          onExpireRef.current?.();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, durationMinutes]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    formattedTime,
    remainingSeconds,
    isExpired: remainingSeconds <= 0,
    isWarning: remainingSeconds > 0 && remainingSeconds <= 120, // < 2 phút
    isCritical: remainingSeconds > 0 && remainingSeconds <= 30, // < 30 giây
  };
}
