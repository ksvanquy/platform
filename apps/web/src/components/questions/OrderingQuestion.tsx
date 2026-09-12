import React, { useEffect } from 'react';
import { QuestionProps } from './SingleChoiceQuestion.js';
import { OrderItem } from '../../types/quiz.types.js';

export const OrderingQuestion: React.FC<QuestionProps> = ({
  question,
  value,
  onChange,
  disabled = false,
}) => {
  const initialItems: readonly OrderItem[] = question.metadata?.itemsToOrder || [];

  // Mảng id thứ tự hiện tại
  const orderedIds: string[] = Array.isArray(value) && value.length > 0
    ? value.map(String)
    : initialItems.map((item) => item.id);

  // Nếu chưa có value ban đầu, khởi tạo bằng thứ tự hiện có
  useEffect(() => {
    if (!value && initialItems.length > 0) {
      onChange(initialItems.map((item) => item.id));
    }
  }, [value, initialItems, onChange]);

  const itemsMap = new Map(initialItems.map((item) => [item.id, item.content]));

  const moveItem = (index: number, direction: 'UP' | 'DOWN') => {
    if (disabled) return;
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) return;

    const newOrder = [...orderedIds];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    onChange(newOrder);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-sky-400/90 font-medium mb-1">
        * Nhấn nút mũi tên Lên / Xuống để sắp xếp các bước theo trình tự chính xác
      </div>
      <div className="space-y-2">
        {orderedIds.map((id, index) => {
          const content = itemsMap.get(id) || id;

          return (
            <div
              key={id}
              className="flex items-center justify-between p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-xl transition-all hover:border-slate-600"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-xs font-bold border border-sky-500/30">
                  {index + 1}
                </span>
                <span className="text-sm md:text-base text-slate-200 font-medium">
                  {content}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveItem(index, 'UP')}
                  className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  title="Di chuyển lên"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={disabled || index === orderedIds.length - 1}
                  onClick={() => moveItem(index, 'DOWN')}
                  className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  title="Di chuyển xuống"
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
