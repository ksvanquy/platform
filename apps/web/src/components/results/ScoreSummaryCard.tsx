import React from 'react';
import { EvaluationResult } from '../../types/scoring.types.js';

interface ScoreSummaryCardProps {
  result: EvaluationResult;
}

export const ScoreSummaryCard: React.FC<ScoreSummaryCardProps> = ({ result }) => {
  const isPassed = result.isPassed ?? (result.percentage >= 80);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 text-center relative overflow-hidden shadow-2xl">
      {/* Glow background accent */}
      <div
        className={`absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isPassed ? 'bg-emerald-500' : 'bg-rose-500'
        }`}
      />

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 border bg-slate-800 text-slate-300 border-slate-700">
        Kết quả đánh giá
      </div>

      <div className="text-4xl md:text-5xl font-black text-slate-100 mb-2 font-mono">
        <span className={isPassed ? 'text-emerald-400' : 'text-rose-400'}>
          {result.totalScoreAwarded}
        </span>
        <span className="text-slate-500 text-2xl md:text-3xl font-normal">
          {' '}/ {result.totalMaxScore} điểm
        </span>
      </div>

      <div className="text-lg font-medium text-slate-400 mb-6">
        Tỷ lệ chính xác: <strong className="text-slate-200">{result.percentage}%</strong>
      </div>

      <div className="inline-block">
        {isPassed ? (
          <div className="px-5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-bold text-sm md:text-base flex items-center gap-2">
            <span>🎉</span>
            <span>CHÚC MỪNG: BẠN ĐÃ ĐẠT BÀI THI</span>
          </div>
        ) : (
          <div className="px-5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-400 font-bold text-sm md:text-base flex items-center gap-2">
            <span>✗</span>
            <span>RẤT TIẾC: CHƯA ĐẠT ĐIỂM YÊU CẦU</span>
          </div>
        )}
      </div>
    </div>
  );
};
