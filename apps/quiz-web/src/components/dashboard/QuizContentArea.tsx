import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@platform/auth-client';
import {
  ClockIcon,
  ShieldCheckIcon,
  PlayIcon,
  SearchIcon,
  AwardIcon,
  TagIcon,
  BookOpenIcon,
  LayersIcon,
} from '../common/Icons.js';

interface QuizItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  isPublic?: boolean;
  primaryNodeId?: string | null;
  currentPublishedVersionId?: string;
}

interface QuizContentAreaProps {
  quizzes: QuizItem[];
  selectedQuizId: string;
  onSelectQuiz: (quizId: string) => void;
  selectedNodeName: string;
  selectedNodeBreadcrumbs: string[];
  categoryMap: Record<string, string>;
  user: UserProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
  onStartQuiz: (quizId: string) => void;
  quizDetails?: any;
  loadingDetails?: boolean;
  isLoadingQuizzes?: boolean;
}

export const QuizContentArea: React.FC<QuizContentAreaProps> = ({
  quizzes,
  selectedQuizId,
  onSelectQuiz,
  selectedNodeName,
  selectedNodeBreadcrumbs,
  categoryMap,
  user,
  isLoading,
  errorMessage,
  onStartQuiz,
  quizDetails,
  loadingDetails = false,
  isLoadingQuizzes = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter quizzes by search term
  const filteredQuizzes = useMemo(() => {
    if (!searchTerm.trim()) return quizzes;
    const term = searchTerm.toLowerCase();
    return quizzes.filter(
      (q) =>
        q.title.toLowerCase().includes(term) ||
        q.code.toLowerCase().includes(term) ||
        (q.description && q.description.toLowerCase().includes(term))
    );
  }, [quizzes, searchTerm]);

  // Find currently selected quiz
  const selectedQuiz = useMemo(() => {
    return quizzes.find((q) => q.id === selectedQuizId) || quizzes[0] || null;
  }, [quizzes, selectedQuizId]);

  const currentVersion = quizDetails?.currentVersion;
  const durationMinutes = currentVersion?.durationMinutes || 15;
  const passingScore = currentVersion?.passingScore || 5;
  const totalQuestions = currentVersion?.questions?.length || 3;
  const maxAttempts = currentVersion?.maxAttempts || 3;

  const handleStartClick = () => {
    if (selectedQuiz) {
      onStartQuiz(selectedQuiz.id);
    }
  };

  return (
    <main
      id="quiz-content-area"
      className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6"
    >
      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 shrink-0">
        <div className="space-y-1">
          {/* Breadcrumbs */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium overflow-x-auto whitespace-nowrap">
            <span className="flex items-center space-x-1 text-slate-400">
              <LayersIcon size={13} />
              <span>Chủ đề</span>
            </span>
            {selectedNodeBreadcrumbs.length > 0 ? (
              selectedNodeBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <span className="text-slate-600">/</span>
                  <span
                    className={
                      idx === selectedNodeBreadcrumbs.length - 1
                        ? 'text-sky-400 font-semibold'
                        : 'text-slate-400'
                    }
                  >
                    {crumb}
                  </span>
                </React.Fragment>
              ))
            ) : (
              <>
                <span className="text-slate-600">/</span>
                <span className="text-sky-400 font-semibold">Tất cả môn / chủ đề</span>
              </>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
            <span>{selectedNodeName || 'Danh Sách Bài Thi'}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {filteredQuizzes.length} đề thi
            </span>
            {isLoadingQuizzes && (
              <span className="text-xs text-sky-400 font-normal animate-pulse">Đang tải...</span>
            )}
          </h1>
        </div>

        {/* Search Input for quizzes */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên hoặc mã đề..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <SearchIcon size={14} />
          </div>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error Message banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-3">
          <span className="text-base shrink-0">⚠️</span>
          <div className="space-y-0.5">
            <div className="font-bold">Lỗi khởi tạo ca thi:</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* 2-Column Content Grid: Left: Quiz List (60%), Right: Exam Session Info (40%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Danh sách bài thi tương ứng (7 cols) */}
        <div className="xl:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <BookOpenIcon size={16} className="text-sky-400" />
              <span>Danh Sách Bài Thi Tương Ứng</span>
            </h2>
            <span className="text-xs text-slate-400">
              Nhấp chọn để xem thông tin ca thi
            </span>
          </div>

          {filteredQuizzes.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/50 border border-dashed border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto text-xl">
                📂
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-300">Không tìm thấy bài thi phù hợp</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchTerm
                    ? `Không có bài thi nào khớp với từ khóa "${searchTerm}".`
                    : 'Chưa có đề thi nào trong danh mục này. Hãy thử chọn môn học khác ở cây thư mục bên trái.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredQuizzes.map((quiz) => {
                const isSelected = selectedQuiz?.id === quiz.id;
                const topicName = quiz.primaryNodeId ? categoryMap[quiz.primaryNodeId] : null;

                return (
                  <div
                    key={quiz.id}
                    id={`quiz-card-${quiz.id}`}
                    onClick={() => onSelectQuiz(quiz.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all relative overflow-hidden group ${
                      isSelected
                        ? 'bg-gradient-to-r from-sky-950/40 to-slate-900 border-sky-500 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/30'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Title & Badges */}
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span
                            className={`text-sm font-bold tracking-tight ${
                              isSelected ? 'text-sky-200' : 'text-slate-100 group-hover:text-white'
                            }`}
                          >
                            {quiz.title}
                          </span>

                          {quiz.isPublic ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Công khai
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              Chính thức
                            </span>
                          )}

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Đang mở
                          </span>
                        </div>

                        {/* Description */}
                        {quiz.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {quiz.description}
                          </p>
                        )}

                        {/* Metadata Footer */}
                        <div className="flex items-center space-x-3 text-xs text-slate-400 pt-1 flex-wrap gap-y-1">
                          <span className="font-mono text-[11px] text-slate-400">
                            Mã: <strong className="text-slate-200 font-semibold">{quiz.code}</strong>
                          </span>

                          {topicName && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              <TagIcon size={11} />
                              <span className="truncate max-w-[150px]">{topicName}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Select Action Button */}
                      <div className="shrink-0 flex flex-col items-end space-y-2">
                        <button
                          type="button"
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                              : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-slate-100 border border-slate-700/60'
                          }`}
                        >
                          {isSelected ? '✓ Đang chọn' : 'Chọn đề'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Thông tin ca thi (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <ClockIcon size={16} className="text-sky-400" />
              <span>Thông Tin Ca Thi</span>
            </h2>
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Hệ thống trực tuyến</span>
            </span>
          </div>

          {selectedQuiz ? (
            <div
              id="exam-session-info-card"
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5"
            >
              {/* Exam Header */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                  Đề thi được chọn
                </div>
                <div className="text-base font-black text-slate-100 leading-tight">
                  {selectedQuiz.title}
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                    Mã: {selectedQuiz.code}
                  </span>
                  <span>•</span>
                  <span>{selectedQuiz.isPublic ? 'Khảo sát mở' : 'Đánh giá chính thức'}</span>
                </div>
              </div>

              {/* Candidate Info */}
              <div className="space-y-2 text-xs">
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  Thông tin thí sinh
                </div>
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Họ tên học viên:</span>
                    <span className="font-bold text-slate-200 text-xs">
                      {user?.name || user?.email || 'Thí sinh'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Mã định danh:</span>
                    <span className="font-mono text-indigo-300 text-[11px] truncate block">
                      {user?.id || 'candidate_01'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Exam Metrics Grid */}
              <div className="space-y-2 text-xs">
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  Quy cách ca thi
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center space-x-1.5 text-sky-400">
                      <ClockIcon size={14} />
                      <span className="text-[11px] font-semibold">Thời gian làm bài</span>
                    </div>
                    <div className="text-base font-black text-slate-100">
                      {loadingDetails ? (
                        <span className="text-xs text-slate-500">Đang tải...</span>
                      ) : (
                        `${durationMinutes} phút`
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center space-x-1.5 text-emerald-400">
                      <AwardIcon size={14} />
                      <span className="text-[11px] font-semibold">Điểm đạt tối thiểu</span>
                    </div>
                    <div className="text-base font-black text-slate-100">
                      {loadingDetails ? (
                        <span className="text-xs text-slate-500">Đang tải...</span>
                      ) : (
                        `${passingScore} điểm`
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center space-x-1.5 text-indigo-400">
                      <BookOpenIcon size={14} />
                      <span className="text-[11px] font-semibold">Số câu hỏi</span>
                    </div>
                    <div className="text-base font-black text-slate-100">
                      {loadingDetails ? (
                        <span className="text-xs text-slate-500">Đang tải...</span>
                      ) : (
                        `${totalQuestions} câu`
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center space-x-1.5 text-amber-400">
                      <ShieldCheckIcon size={14} />
                      <span className="text-[11px] font-semibold">Lượt thi cho phép</span>
                    </div>
                    <div className="text-base font-black text-slate-100">
                      {loadingDetails ? (
                        <span className="text-xs text-slate-500">Đang tải...</span>
                      ) : (
                        `${maxAttempts} lượt`
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Exam Rules & Integrity */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-[11px] text-slate-400">
                <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <ShieldCheckIcon size={14} className="text-sky-400" />
                  <span>Quy chế ca thi & Bảo mật:</span>
                </div>
                <ul className="space-y-1 text-slate-400 list-disc list-inside">
                  <li>Thời gian đếm ngược chính xác theo đồng hồ máy chủ (RFC Timing).</li>
                  <li>Tự động kích hoạt cơ chế phát hiện mở nhiều tab gian lận.</li>
                  <li>Lưu đáp án tự động sau mỗi câu trả lời (Idempotency).</li>
                  <li>Hệ thống tự động thu bài khi đồng hồ đếm ngược về 0.</li>
                </ul>
              </div>

              {/* Start Exam Button */}
              <button
                id="btn-start-exam"
                type="button"
                onClick={handleStartClick}
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Đang khởi tạo ca thi...</span>
                  </>
                ) : (
                  <>
                    <PlayIcon size={16} className="text-slate-950 fill-slate-950" />
                    <span>BẮT ĐẦU VÀO CA THI</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-400">Vui lòng chọn một đề thi để xem thông tin ca thi.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
