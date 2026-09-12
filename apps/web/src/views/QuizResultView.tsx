import React from 'react';
import { ScoreSummaryCard } from '../components/results/ScoreSummaryCard.js';
import { QuestionFeedbackList } from '../components/results/QuestionFeedbackList.js';
import { EvaluationResult } from '../types/scoring.types.js';
import { QuestionDTO } from '../types/quiz.types.js';

interface QuizResultViewProps {
  result: EvaluationResult;
  questions?: readonly QuestionDTO[];
  onRestart: () => void;
}

export const QuizResultView: React.FC<QuizResultViewProps> = ({
  result,
  questions = [],
  onRestart,
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <ScoreSummaryCard result={result} />

      <QuestionFeedbackList details={result.details} questions={questions} />

      <div className="flex justify-center pt-4">
        <button
          type="button"
          onClick={onRestart}
          className="px-8 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-sky-500/20"
        >
          🔄 Làm bài thi khác / Thi lại
        </button>
      </div>
    </div>
  );
};
