import React, { useState, useMemo, useEffect } from 'react';
import { QuizHeader } from '../components/runner/QuizHeader.js';
import { QuizFooter } from '../components/runner/QuizFooter.js';
import { QuestionPalette } from '../components/runner/QuestionPalette.js';
import { QuestionRenderer } from '../components/questions/QuestionRegistry.js';
import { SessionDTO, QuestionDTO } from '../types/quiz.types.js';

interface QuizActiveViewProps {
  session: SessionDTO;
  questions: readonly QuestionDTO[];
  answers: Record<string, unknown>;
  isSubmitting: boolean;
  onAnswerChange: (questionId: string, value: unknown) => void;
  onSubmit: () => void;
}

export const QuizActiveView: React.FC<QuizActiveViewProps> = ({
  session,
  questions,
  answers,
  isSubmitting,
  onAnswerChange,
  onSubmit,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Giai đoạn 1: Lớp Phòng vệ Trình duyệt Tuyệt đối (Triple-Guard System)
  useEffect(() => {
    // Không chặn nếu đang trong tiến trình nộp bài hợp lệ
    if (isSubmitting) return;

    // 1. Lá chắn BeforeUnload: Cảnh báo khi người dùng tắt tab, reload (F5) hoặc đóng trình duyệt
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Bạn đang trong ca thi. Rời khỏi trang có thể làm gián đoạn tiến trình làm bài!';
      return e.returnValue;
    };

    // 2. Lá chắn Keydown: Chặn phím Backspace làm lùi trang (History Back) khi không focus vào ô nhập liệu
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const activeEl = document.activeElement as HTMLElement | null;
        const isInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable);
        if (!isInput) {
          e.preventDefault();
        }
      }
    };

    // 3. Lá chắn PopState (History Trap): Bẫy thao tác bấm nút Back của chuột hoặc trình duyệt
    try {
      window.history.pushState({ inActiveQuizSession: true }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      try {
        window.history.pushState({ inActiveQuizSession: true }, '', window.location.href);
      } catch {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isSubmitting]);

  // Giai đoạn 3: Phát hiện trạng thái mất kết nối mạng và cảnh báo thí sinh
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentQuestion = questions[currentIndex];

  // Tính số câu đã hoàn thành
  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const val = answers[q.id];
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }).length;
  }, [questions, answers]);

  const unansweredCount = questions.length - answeredCount;

  const handleExpire = () => {
    // Tự động nộp bài khi hết giờ
    onSubmit();
  };

  if (!currentQuestion) {
    return (
      <div className="p-8 text-center text-slate-400">
        Không tìm thấy câu hỏi nào trong đề thi.
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <QuizHeader
        title={`Bài thi: ${session.quizId}`}
        sessionId={session.id}
        startedAt={session.startedAt}
        durationMinutes={session.durationMinutes}
        deadline={session.deadline}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        onExpire={handleExpire}
      />

      {/* Cảnh báo mất kết nối mạng (Network Offline Alert) */}
      {isOffline && (
        <aside
          aria-label="Cảnh báo mất kết nối mạng"
          className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2.5 text-rose-200 text-xs flex items-center justify-center gap-2 font-medium z-10 animate-in fade-in duration-200"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span>Mất kết nối Internet! Các câu trả lời đang được bảo lưu tạm trên trình duyệt. Vui lòng không tắt tab và kiểm tra đường truyền mạng.</span>
        </aside>
      )}

      {/* Thanh chỉ dẫn phím tắt */}
      {!isOffline && (
        <div className="bg-slate-900/40 border-b border-slate-800/60 px-4 py-1.5 text-slate-400 text-[11px] hidden sm:flex items-center justify-between max-w-5xl w-full mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-sky-400">💡</span>
            <span>Chọn đáp án và bấm "Nộp bài" khi bạn đã hoàn thành bài thi.</span>
          </div>
          <span className="text-slate-500">Bấm số (1, 2, 3...) hoặc click trực tiếp để chọn đáp án</span>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Khung hiển thị câu hỏi trọng tâm (Chiếm 2 cột trên màn lớn) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <span className="px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold uppercase tracking-wider">
                Câu {currentIndex + 1} / {questions.length}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {currentQuestion.points} điểm
              </span>
            </div>

            <div className="text-base sm:text-lg font-semibold text-slate-100 leading-relaxed">
              {currentQuestion.prompt}
            </div>

            <div className="pt-2">
              <QuestionRenderer
                question={currentQuestion}
                value={answers[currentQuestion.id]}
                onChange={(val) => onAnswerChange(currentQuestion.id, val)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Cột mục lục chuyển câu nhanh (Question Palette) */}
        <div className="lg:col-span-1 space-y-6">
          <QuestionPalette
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            onSelectIndex={(idx) => setCurrentIndex(idx)}
          />
        </div>
      </main>

      <QuizFooter
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        unansweredCount={unansweredCount}
        isSubmitting={isSubmitting}
        onPrev={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
        onNext={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
        onSubmit={onSubmit}
      />
    </div>
  );
};
