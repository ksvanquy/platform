import React from 'react';
import { QuestionDTO } from '../../types/quiz.types.js';

export interface QuestionProps {
  question: QuestionDTO;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

export const SingleChoiceQuestion: React.FC<QuestionProps> = ({
  question,
  value,
  onChange,
  disabled = false,
}) => {
  const options = question.metadata?.options || [];
  const selectedId = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  return (
    <div className="space-y-3">
      {options.map((opt) => {
        const isSelected = selectedId === opt.id;
        return (
          <label
            key={opt.id}
            className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
              isSelected
                ? 'bg-sky-500/10 border-sky-500 text-sky-200'
                : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600 text-slate-300'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name={`q_${question.id}`}
              value={opt.id}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onChange(opt.id)}
              className="w-4 h-4 text-sky-500 bg-slate-900 border-slate-600 focus:ring-sky-500 focus:ring-2"
            />
            <span className="text-sm md:text-base font-medium leading-relaxed">{opt.content}</span>
          </label>
        );
      })}
    </div>
  );
};
