import React from 'react';
import { useServerCountdown } from '../../hooks/useServerCountdown.js';

interface QuizTimerProps {
  startedAt?: string;
  durationMinutes?: number;
  deadline?: string;
  onExpire?: () => void;
}

export const QuizTimer: React.FC<QuizTimerProps> = ({
  startedAt,
  durationMinutes,
  deadline,
  onExpire,
}) => {
  const { formattedTime, isExpired, isWarning, isCritical } = useServerCountdown({
    startedAt,
    durationMinutes,
    deadline,
    onExpire,
  });

  let statusClass = 'bg-slate-800 text-sky-400 border-slate-700';
  if (isCritical) {
    statusClass = 'bg-rose-950/80 text-rose-400 border-rose-600 animate-pulse';
  } else if (isWarning) {
    statusClass = 'bg-amber-950/80 text-amber-400 border-amber-600';
  } else if (isExpired) {
    statusClass = 'bg-red-950 text-red-500 border-red-800';
  }

  return (
    <div
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border font-mono font-bold text-sm tracking-wide shadow-sm transition-colors ${statusClass}`}
      title="Đồng hồ đếm ngược theo máy chủ (Server Clock)"
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{isExpired ? '00:00 (Hết giờ)' : formattedTime}</span>
    </div>
  );
};
