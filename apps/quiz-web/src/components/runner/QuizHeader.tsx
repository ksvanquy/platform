import React from 'react';
import { QuizTimer } from './QuizTimer.js';
import { SaveStatus } from '../../hooks/useQuizSession.js';

interface QuizHeaderProps {
  title: string;
  sessionId: string;
  startedAt?: string;
  durationMinutes?: number;
  totalQuestions: number;
  answeredCount: number;
  saveStatus: SaveStatus;
  onExpire?: () => void;
}

export const QuizHeader: React.FC<QuizHeaderProps> = ({
  title,
  sessionId,
  startedAt,
  durationMinutes,
  totalQuestions,
  answeredCount,
  saveStatus,
  onExpire,
}) => {
  const percentage = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 px-4 py-3.5">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base md:text-lg font-bold text-slate-100 truncate max-w-md">
              {title}
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
              ID: {sessionId.slice(0, 14)}...
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span>
              Đã làm: <strong className="text-sky-400">{answeredCount}</strong>/{totalQuestions} ({percentage}%)
            </span>

            {/* Trạng thái Autosave */}
            <span className="flex items-center gap-1">
              {saveStatus === 'SAVING' && (
                <span className="text-amber-400 animate-pulse">● Đang lưu...</span>
              )}
              {saveStatus === 'SAVED' && (
                <span className="text-emerald-400">✓ Đã tự động lưu</span>
              )}
              {saveStatus === 'ERROR' && (
                <span className="text-rose-400 font-semibold">⚠ Lỗi lưu bài</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          <QuizTimer
            startedAt={startedAt}
            durationMinutes={durationMinutes}
            onExpire={onExpire}
          />
        </div>
      </div>

      {/* Thanh tiến độ mỏng chạy ngang */}
      <div className="w-full bg-slate-800 h-1 mt-3 rounded-full overflow-hidden">
        <div
          className="bg-sky-500 h-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </header>
  );
};
