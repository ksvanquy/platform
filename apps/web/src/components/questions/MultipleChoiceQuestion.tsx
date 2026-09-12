import React from 'react';
import { QuestionProps } from './SingleChoiceQuestion.js';

export const MultipleChoiceQuestion: React.FC<QuestionProps> = ({
  question,
  value,
  onChange,
  disabled = false,
}) => {
  const options = question.metadata?.options || [];
  const selectedValues: string[] = Array.isArray(value) ? value.map(String) : [];

  const handleToggle = (optId: string) => {
    if (disabled) return;
    if (selectedValues.includes(optId)) {
      onChange(selectedValues.filter((id) => id !== optId));
    } else {
      onChange([...selectedValues, optId]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-sky-400/90 font-medium mb-1">
        * Bạn có thể chọn một hoặc nhiều phương án đúng
      </div>
      {options.map((opt) => {
        const isSelected = selectedValues.includes(opt.id);
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
              type="checkbox"
              value={opt.id}
              checked={isSelected}
              disabled={disabled}
              onChange={() => handleToggle(opt.id)}
              className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-600 focus:ring-sky-500 focus:ring-2"
            />
            <span className="text-sm md:text-base font-medium leading-relaxed">{opt.content}</span>
          </label>
        );
      })}
    </div>
  );
};
