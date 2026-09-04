import React from 'react';
import { QuestionDTO } from '../../types/quiz.types.js';

interface QuestionPaletteProps {
  questions: readonly QuestionDTO[];
  currentIndex: number;
  answers: Record<string, unknown>;
  onSelectIndex: (index: number) => void;
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  questions,
  currentIndex,
  answers,
  onSelectIndex,
}) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Mục lục câu hỏi ({questions.length})
      </div>
      <div className="flex flex-wrap gap-2.5">
        {questions.map((q, index) => {
          const isCurrent = currentIndex === index;
          const hasAnswer =
            answers[q.id] !== undefined &&
            answers[q.id] !== null &&
            answers[q.id] !== '' &&
            (!Array.isArray(answers[q.id]) || (answers[q.id] as any[]).length > 0);

          let btnClass = 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700';

          if (hasAnswer) {
            btnClass = 'bg-emerald-950/80 text-emerald-400 border-emerald-600/80 font-semibold';
          }

          if (isCurrent) {
            btnClass = 'bg-sky-500 text-slate-950 border-sky-400 font-bold ring-2 ring-sky-500/50 shadow-md shadow-sky-500/20';
          }

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelectIndex(index)}
              className={`w-11 h-11 rounded-xl border text-sm flex items-center justify-center transition-all cursor-pointer ${btnClass}`}
              title={`Câu ${index + 1}: ${q.prompt.slice(0, 30)}...`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-sky-500 inline-block" />
          <span>Đang làm</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-950 border border-emerald-600 inline-block" />
          <span>Đã trả lời</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700 inline-block" />
          <span>Chưa làm</span>
        </div>
      </div>
    </div>
  );
};
