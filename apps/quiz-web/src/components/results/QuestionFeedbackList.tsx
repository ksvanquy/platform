import React from 'react';
import { QuestionEvaluationDetail } from '../../types/scoring.types.js';
import { QuestionDTO } from '../../types/quiz.types.js';

interface QuestionFeedbackListProps {
  details?: Record<string, QuestionEvaluationDetail>;
  questions?: readonly QuestionDTO[];
}

export const QuestionFeedbackList: React.FC<QuestionFeedbackListProps> = ({
  details,
  questions = [],
}) => {
  if (!details || Object.keys(details).length === 0) {
    return null;
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-4">
      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <span>📋</span>
        <span>Chi tiết điểm số từng câu</span>
      </h3>

      <div className="space-y-3">
        {Object.entries(details).map(([qId, item], idx) => {
          const qObj = questionMap.get(qId);
          const prompt = qObj ? qObj.prompt : `Câu hỏi: ${qId}`;

          return (
            <div
              key={qId}
              className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Câu {idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    {prompt}
                  </span>
                </div>
                {item.feedback && (
                  <p className="text-xs text-slate-400 pl-1">
                    Ghi chú: {item.feedback}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                    item.isCorrect
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {item.isCorrect ? '✓ Chính xác' : '✗ Chưa đúng'}
                </span>

                <span className="font-mono text-sm font-bold text-slate-200">
                  {item.scoreAwarded} / {item.maxScore}đ
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
