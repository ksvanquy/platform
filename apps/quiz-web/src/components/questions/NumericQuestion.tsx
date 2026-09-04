import React from 'react';
import { QuestionProps } from './SingleChoiceQuestion.js';

export const NumericQuestion: React.FC<QuestionProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const numValue = value !== undefined && value !== null ? String(value) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange(null);
    } else {
      const parsed = parseFloat(val);
      onChange(isNaN(parsed) ? val : parsed);
    }
  };

  return (
    <div className="space-y-2">
      <input
        type="number"
        step="any"
        value={numValue}
        disabled={disabled}
        onChange={handleChange}
        placeholder="Nhập số..."
        className="w-full md:w-64 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors disabled:opacity-60"
      />
      <div className="text-xs text-slate-400 px-1">
        * Chấp nhận số nguyên hoặc số thực (ví dụ: 42 hoặc 3.14)
      </div>
    </div>
  );
};
