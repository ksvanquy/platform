import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@platform/auth-client';
import type { TaxonomyTreeNodeDTO } from '@platform/contracts';
import {
  ClockIcon,
  PlayIcon,
  SearchIcon,
  AwardIcon,
  TagIcon,
  BookOpenIcon,
  LayersIcon,
  AcademicCapIcon,
  PanelLeftIcon,
} from '../common/Icons.js';

export interface QuizItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status?: string;
  isPublic?: boolean;
  durationMinutes?: number;
  questionsCount?: number;
  passingScore?: number;
  primaryNodeId?: string | null;
  gradeNodeId?: string | null;
  currentPublishedVersionId?: string;
}

interface QuizContentAreaProps {
  quizzes: QuizItem[];
  selectedQuizId?: string;
  onSelectQuiz?: (quizId: string) => void;
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
  gradeTree?: TaxonomyTreeNodeDTO[];
  selectedGradeNodeId?: string;
  onSelectGradeNode?: (gradeNodeId: string) => void;
  gradeMap?: Record<string, string>;
  gradeCounts?: Record<string, number>;
  onClearCategory?: () => void;
  onClearGrade?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const QuizContentArea: React.FC<QuizContentAreaProps> = ({
  quizzes,
  selectedNodeName,
  selectedNodeBreadcrumbs,
  categoryMap,
  isLoading,
  errorMessage,
  onStartQuiz,
  isLoadingQuizzes = false,
  gradeTree = [],
  selectedGradeNodeId = '',
  onSelectGradeNode,
  gradeMap = {},
  gradeCounts = {},
  onClearCategory,
  onClearGrade,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStartingQuizId, setActiveStartingQuizId] = useState<string | null>(null);

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

  // Identify the active educational stage root (Tiểu học, THCS, THPT) based on selectedGradeNodeId
  const activeStageRoot = useMemo(() => {
    if (!selectedGradeNodeId) return null;
    const directRoot = gradeTree.find((r) => r.id === selectedGradeNodeId);
    if (directRoot) return directRoot;
    return gradeTree.find((r) => r.children?.some((c) => c.id === selectedGradeNodeId)) || null;
  }, [gradeTree, selectedGradeNodeId]);

  const handleStartExam = (quizId: string) => {
    setActiveStartingQuizId(quizId);
    onStartQuiz(quizId);
  };

  return (
    <main
      id="quiz-content-area"
      className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 p-4 sm:p-5 lg:p-6 space-y-5"
    >
      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80 shrink-0">
        <div className="space-y-1">
          {/* Breadcrumbs with Sidebar Toggle */}
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium overflow-x-auto whitespace-nowrap">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="hidden lg:flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-sky-300 border border-slate-800 text-[11px] font-medium transition-colors cursor-pointer mr-1"
                title={isSidebarCollapsed ? 'Mở cây thư mục tri thức' : 'Thu gọn thanh danh mục (Tối đa không gian)'}
              >
                <PanelLeftIcon size={12} className={isSidebarCollapsed ? 'text-sky-400' : 'text-slate-400'} />
                <span>{isSidebarCollapsed ? 'Hiện danh mục' : 'Thu gọn'}</span>
              </button>
            )}

            <span className="flex items-center space-x-1 text-slate-400">
              <LayersIcon size={12} />
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
                <span className="text-sky-400 font-semibold">Tất cả đề thi</span>
              </>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2.5">
            <span>{selectedNodeName || 'Danh Sách Bài Thi'}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700 font-mono">
              {filteredQuizzes.length} bài thi
            </span>
            {isLoadingQuizzes && (
              <span className="text-xs text-sky-400 font-normal animate-pulse">Đang tải...</span>
            )}
          </h1>
        </div>

        {/* Search Input for exams */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên bài thi hoặc mã đề..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-inner"
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

      {/* 2D Facet Filter Bar: Khối Lớp & Cấp Học */}
      <div id="grade-facet-filter-bar" className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <div className="flex items-center space-x-2">
            <AcademicCapIcon size={15} className="text-emerald-400" />
            <span className="uppercase tracking-wider text-[11px] font-bold text-slate-200">
              Lọc theo Khối Lớp & Cấp Học
            </span>
          </div>
          {selectedGradeNodeId && (
            <button
              type="button"
              onClick={() => onSelectGradeNode && onSelectGradeNode('')}
              className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              Xem tất cả khối lớp
            </button>
          )}
        </div>

        {/* Cấp học gốc: [Tất cả khối lớp] | [Tiểu học] [THCS] [THPT] */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
          <button
            type="button"
            onClick={() => onSelectGradeNode && onSelectGradeNode('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
              !selectedGradeNodeId
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/50'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
            }`}
          >
            <span>Tất cả khối lớp</span>
          </button>

          <div className="h-4 w-px bg-slate-700/70 shrink-0 mx-1" />

          {gradeTree.map((root) => {
            const isRootSelected = selectedGradeNodeId === root.id || activeStageRoot?.id === root.id;
            const count = gradeCounts[root.id] ?? 0;
            return (
              <button
                key={root.id}
                type="button"
                onClick={() => onSelectGradeNode && onSelectGradeNode(root.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer ${
                  isRootSelected
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/50'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
                }`}
              >
                <span>{root.name}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${
                      isRootSelected
                        ? 'bg-slate-950 text-emerald-300'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Khối lớp con tương ứng */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 scrollbar-thin scrollbar-thumb-slate-800 border-t border-slate-800/40">
          {(activeStageRoot?.children && activeStageRoot.children.length > 0
            ? activeStageRoot.children
            : gradeTree.flatMap((root) => root.children || [])
          ).map((gradeNode) => {
            const isSelected = selectedGradeNodeId === gradeNode.id;
            const count = gradeCounts[gradeNode.id] ?? 0;
            return (
              <button
                key={gradeNode.id}
                type="button"
                onClick={() => onSelectGradeNode && onSelectGradeNode(gradeNode.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20 ring-1 ring-sky-400/50'
                    : count > 0
                    ? 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
                    : 'bg-slate-900/60 text-slate-500 hover:text-slate-300 border border-slate-800/80'
                }`}
              >
                <span>{gradeNode.name}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1 rounded font-mono font-bold leading-none ${
                      isSelected
                        ? 'bg-slate-950 text-sky-300'
                        : 'bg-slate-700/80 text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Filter Chips Bar */}
        {((selectedNodeName && selectedNodeName !== 'Tất cả bài thi' && selectedNodeName !== 'Tất cả đề thi') || selectedGradeNodeId) && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60 flex-wrap text-xs">
            {selectedNodeName && selectedNodeName !== 'Tất cả bài thi' && selectedNodeName !== 'Tất cả đề thi' && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-medium text-[11px]">
                <TagIcon size={11} />
                <span>Chủ đề: {selectedNodeName}</span>
                {onClearCategory && (
                  <button
                    type="button"
                    onClick={onClearCategory}
                    className="ml-1 text-indigo-400 hover:text-white cursor-pointer"
                    title="Bỏ lọc chủ đề"
                  >
                    ✕
                  </button>
                )}
              </span>
            )}

            {selectedGradeNodeId && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium text-[11px]">
                <AcademicCapIcon size={12} />
                <span>Khối: {gradeMap[selectedGradeNodeId] || selectedGradeNodeId}</span>
                {onClearGrade && (
                  <button
                    type="button"
                    onClick={onClearGrade}
                    className="ml-1 text-emerald-400 hover:text-white cursor-pointer"
                    title="Bỏ lọc khối lớp"
                  >
                    ✕
                  </button>
                )}
              </span>
            )}

            {selectedNodeName && selectedGradeNodeId && (
              <button
                type="button"
                onClick={() => {
                  if (onClearCategory) onClearCategory();
                  if (onClearGrade) onClearGrade();
                }}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline ml-auto cursor-pointer"
              >
                Đặt lại tất cả bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error Message banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-3 shrink-0">
          <span className="text-base shrink-0">⚠️</span>
          <div className="space-y-0.5">
            <div className="font-bold">Lỗi khởi tạo bài thi:</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* DANH SÁCH BÀI THI - DẠNG CARD (5 CARD TRÊN 1 HÀNG TRÊN DESKTOP/MÀN RỘNG) */}
      <div className="flex-1 space-y-3">
        {filteredQuizzes.length === 0 ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto text-2xl">
              📂
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-300">Không tìm thấy bài thi phù hợp</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchTerm
                  ? `Không có bài thi nào khớp với từ khóa "${searchTerm}". Hãy thử xóa bộ lọc tìm kiếm.`
                  : 'Chưa có đề thi nào trong danh mục hoặc khối lớp đã chọn. Hãy thử chọn môn học khác ở cây tri thức.'}
              </p>
            </div>
          </div>
        ) : (
          /* Grid 5 cards per row on wide screens (xl:grid-cols-5 2xl:grid-cols-5) */
          <div
            id="quiz-cards-grid"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-4 items-stretch"
          >
            {filteredQuizzes.map((quiz) => {
              const topicName = quiz.primaryNodeId ? categoryMap[quiz.primaryNodeId] : null;
              const gradeName = quiz.gradeNodeId ? gradeMap[quiz.gradeNodeId] : null;
              const isStartingThisQuiz = isLoading && activeStartingQuizId === quiz.id;

              return (
                <div
                  key={quiz.id}
                  id={`quiz-card-${quiz.id}`}
                  className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-sky-500/60 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/10 hover:-translate-y-1 group relative overflow-hidden h-full"
                >
                  {/* Card Top: Badges & Tags */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      {/* Status badge */}
                      <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Đang mở</span>
                      </span>

                      {/* Public / Official badge */}
                      {quiz.isPublic ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/80">
                          Khảo sát
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/25">
                          Chính thức
                        </span>
                      )}
                    </div>

                    {/* Title & Code */}
                    <div className="space-y-1">
                      <h3
                        className="text-sm font-bold text-slate-100 group-hover:text-sky-300 transition-colors line-clamp-2 leading-snug tracking-tight"
                        title={quiz.title}
                      >
                        {quiz.title}
                      </h3>
                      <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
                        <span className="text-slate-500">Mã:</span>
                        <strong className="text-slate-300 font-semibold truncate">{quiz.code}</strong>
                      </div>
                    </div>

                    {/* Subject / Grade tags */}
                    {(topicName || gradeName) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {topicName && (
                          <span
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 max-w-[130px] truncate"
                            title={topicName}
                          >
                            <TagIcon size={10} className="shrink-0" />
                            <span className="truncate">{topicName}</span>
                          </span>
                        )}
                        {gradeName && (
                          <span
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 max-w-[110px] truncate"
                            title={gradeName}
                          >
                            <AcademicCapIcon size={11} className="shrink-0" />
                            <span className="truncate">{gradeName}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Description (subtle 2 lines) */}
                    {quiz.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {quiz.description}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom: Core Specifications & CTA Action Button */}
                  <div className="space-y-3 pt-3 mt-3 border-t border-slate-800/80">
                    {/* 3 Core Metrics: Thời gian, Số câu, Điểm đạt */}
                    <div className="grid grid-cols-3 gap-1 py-2 px-1 rounded-xl bg-slate-950/60 border border-slate-800/70 text-center">
                      {/* Thời gian */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-center text-sky-400">
                          <ClockIcon size={12} />
                        </div>
                        <div className="text-[11px] font-bold text-slate-100 font-mono">
                          {quiz.durationMinutes || 45}p
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium">Thời gian</div>
                      </div>

                      {/* Số câu */}
                      <div className="space-y-0.5 border-x border-slate-800/60">
                        <div className="flex items-center justify-center text-indigo-400">
                          <BookOpenIcon size={12} />
                        </div>
                        <div className="text-[11px] font-bold text-slate-100 font-mono">
                          {quiz.questionsCount || 10}
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium">Câu hỏi</div>
                      </div>

                      {/* Điểm đạt */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-center text-emerald-400">
                          <AwardIcon size={12} />
                        </div>
                        <div className="text-[11px] font-bold text-slate-100 font-mono">
                          {quiz.passingScore ?? 5.0}đ
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium">Điểm đạt</div>
                      </div>
                    </div>

                    {/* Primary Action Button: 1-Click Vào thi */}
                    <button
                      type="button"
                      id={`btn-start-quiz-${quiz.id}`}
                      onClick={() => handleStartExam(quiz.id)}
                      disabled={isLoading}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group-hover:brightness-105"
                      title="Bắt đầu làm bài thi ngay"
                    >
                      {isStartingThisQuiz ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Đang vào thi...</span>
                        </>
                      ) : (
                        <>
                          <PlayIcon size={12} className="text-slate-950 fill-slate-950" />
                          <span>Vào thi</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
