import React, { useState } from 'react';

interface QuizFooterProps {
  currentIndex: number;
  totalQuestions: number;
  unansweredCount: number;
  isSubmitting: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export const QuizFooter: React.FC<QuizFooterProps> = ({
  currentIndex,
  totalQuestions,
  unansweredCount,
  isSubmitting,
  onPrev,
  onNext,
  onSubmit,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleConfirmSubmit = () => {
    setShowConfirmModal(false);
    onSubmit();
  };

  return (
    <>
      <footer className="border-t border-slate-800 bg-slate-900/80 backdrop-blur-md sticky bottom-0 z-20 px-4 py-3.5 mt-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={onPrev}
              className="px-4 py-2.5 min-w-[110px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              ← Câu trước
            </button>

            <button
              type="button"
              disabled={currentIndex === totalQuestions - 1}
              onClick={onNext}
              className="px-4 py-2.5 min-w-[110px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              Câu tiếp →
            </button>
          </div>

          <div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-60"
            >
              {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài thi'}
            </button>
          </div>
        </div>
      </footer>

      {/* Modal xác nhận nộp bài */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-2">
              Xác nhận nộp bài thi?
            </h3>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Sau khi nộp bài, phiên thi sẽ được <strong className="text-rose-400">đóng băng hoàn toàn</strong> và bạn sẽ không thể chỉnh sửa câu trả lời nữa.
            </p>

            {unansweredCount > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs mb-5">
                ⚠ Bạn còn <strong>{unansweredCount}</strong> câu chưa trả lời. Bạn có chắc chắn muốn nộp bài lúc này?
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                Tiếp tục làm bài
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                Đồng ý nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
