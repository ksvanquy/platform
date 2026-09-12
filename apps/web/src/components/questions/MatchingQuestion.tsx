import React from 'react';
import { QuestionProps } from './SingleChoiceQuestion.js';
import { MatchingPair } from '../../types/quiz.types.js';

export const MatchingQuestion: React.FC<QuestionProps> = ({
  question,
  value,
  onChange,
  disabled = false,
}) => {
  const pairs: readonly MatchingPair[] = question.metadata?.pairs || [];
  const matches: Record<string, string> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  // Thu thập danh sách các vế phải (options)
  const rightOptions = Array.from(new Set(pairs.map((p) => p.right)));

  const handleSelectMatch = (pairId: string, rightVal: string) => {
    if (disabled) return;
    onChange({
      ...matches,
      [pairId]: rightVal,
    });
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-sky-400/90 font-medium">
        * Nối từng mục bên trái với đáp án tương ứng bên phải
      </div>
      <div className="space-y-3">
        {pairs.map((pair, index) => {
          const selectedRight = matches[pair.id] || '';

          return (
            <div
              key={pair.id || index}
              className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 text-slate-200 font-medium">
                <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300 font-semibold">
                  {index + 1}
                </span>
                <span>{pair.left}</span>
              </div>

              <div className="w-full md:w-64">
                <select
                  value={selectedRight}
                  disabled={disabled}
                  onChange={(e) => handleSelectMatch(pair.id, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
                >
                  <option value="">-- Chọn đáp án ghép --</option>
                  {rightOptions.map((rightText, rIdx) => (
                    <option key={rIdx} value={rightText}>
                      {rightText}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
