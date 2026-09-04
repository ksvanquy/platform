import React from 'react';
import { QuestionProps } from './SingleChoiceQuestion.js';

export const FillInQuestion: React.FC<QuestionProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const textValue = typeof value === 'string' ? value : '';

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={textValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập câu trả lời của bạn vào đây..."
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          maxLength={2000}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 px-1">
        <span>* Hệ thống tự động chuẩn hóa chữ hoa/thường và khoảng trắng thừa</span>
        <span>{textValue.length}/2000 ký tự</span>
      </div>
    </div>
  );
};
