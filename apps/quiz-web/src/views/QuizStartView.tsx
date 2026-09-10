import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UserProfile } from '@platform/auth-client';
import type { TaxonomyTreeNodeDTO } from '@platform/contracts';
import { quizApi } from '../api/quiz-api.js';
import { TopBar } from '../components/dashboard/TopBar.js';
import { StudentProfileModal } from '../components/dashboard/StudentProfileModal.js';
import { TaxonomyTreeSidebar } from '../components/dashboard/TaxonomyTreeSidebar.js';
import { QuizContentArea } from '../components/dashboard/QuizContentArea.js';
import { BookOpenIcon, XIcon } from '../components/common/Icons.js';

export interface ActiveAttemptBannerInfo {
  id: string;
  examId: string;
  quizId?: string;
  title?: string;
  deadline?: string;
  remainingMinutes?: number;
}

interface QuizStartViewProps {
  quizId: string;
  user: UserProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
  onStart: (quizId: string) => void;
  onLogout: () => void;
  onLoginRequest?: () => void;
  activeAttempt?: ActiveAttemptBannerInfo | null;
  onResumeActiveAttempt?: (attempt: ActiveAttemptBannerInfo) => void;
  onDismissActiveAttempt?: () => void;
}

export const QuizStartView: React.FC<QuizStartViewProps> = ({
  quizId,
  user,
  isLoading,
  errorMessage,
  onStart,
  onLogout,
  onLoginRequest,
  activeAttempt,
  onResumeActiveAttempt,
  onDismissActiveAttempt,
}) => {
  const [selectedQuizId, setSelectedQuizId] = useState<string>(quizId || '');
  const [allQuizzes, setAllQuizzes] = useState<any[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState<boolean>(true);
  const [loadingTree, setLoadingTree] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Taxonomy tree & node lookup maps (TOPIC)
  const [taxonomyTree, setTaxonomyTree] = useState<TaxonomyTreeNodeDTO[]>([]);
  const [selectedCategoryNodeId, setSelectedCategoryNodeId] = useState<string>('');
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [nodeBreadcrumbMap, setNodeBreadcrumbMap] = useState<Record<string, string[]>>({});
  const descendantMapRef = useRef<Record<string, Set<string>>>({});

  // Taxonomy tree & node lookup maps (GRADE) - Task 4.1 & 4.2
  const [gradeTree, setGradeTree] = useState<TaxonomyTreeNodeDTO[]>([]);
  const [selectedGradeNodeId, setSelectedGradeNodeId] = useState<string>('');
  const [gradeMap, setGradeMap] = useState<Record<string, string>>({});
  const gradeDescendantMapRef = useRef<Record<string, Set<string>>>({});

  // 1. Fetch Taxonomy Tree (TOPIC)
  const fetchCategories = async () => {
    setLoadingTree(true);
    try {
      const treeRes = await quizApi.getTaxonomyTree('TOPIC');
      if (treeRes && treeRes.tree) {
        const catMap: Record<string, string> = {};
        const crumbsMap: Record<string, string[]> = {};
        const descendants: Record<string, Set<string>> = {};

        const collectDescendants = (node: TaxonomyTreeNodeDTO): string[] => {
          const ids = [node.id];
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              ids.push(...collectDescendants(child));
            }
          }
          descendants[node.id] = new Set(ids);
          return ids;
        };

        for (const root of treeRes.tree) {
          collectDescendants(root);
        }
        descendantMapRef.current = descendants;

        const traverse = (items: TaxonomyTreeNodeDTO[], parentCrumbs: string[] = []) => {
          for (const item of items) {
            const currentCrumbs = [...parentCrumbs, item.name];
            catMap[item.id] = item.name;
            crumbsMap[item.id] = currentCrumbs;
            if (item.children && item.children.length > 0) {
              traverse(item.children, currentCrumbs);
            }
          }
        };

        traverse(treeRes.tree);
        setTaxonomyTree(treeRes.tree);
        setCategoryMap(catMap);
        setNodeBreadcrumbMap(crumbsMap);
      }
    } catch (err) {
      console.warn('Could not fetch taxonomy tree:', err);
    } finally {
      setLoadingTree(false);
    }
  };

  // 1b. Fetch Taxonomy Tree (GRADE) - Task 4.1
  const fetchGradeTaxonomy = async () => {
    try {
      const treeRes = await quizApi.getTaxonomyTree('GRADE');
      if (treeRes && treeRes.tree) {
        const gMap: Record<string, string> = {};
        const descendants: Record<string, Set<string>> = {};

        const collectDescendants = (node: TaxonomyTreeNodeDTO): string[] => {
          const ids = [node.id];
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              ids.push(...collectDescendants(child));
            }
          }
          descendants[node.id] = new Set(ids);
          return ids;
        };

        for (const root of treeRes.tree) {
          collectDescendants(root);
        }
        gradeDescendantMapRef.current = descendants;

        const traverse = (items: TaxonomyTreeNodeDTO[]) => {
          for (const item of items) {
            gMap[item.id] = item.name;
            if (item.children && item.children.length > 0) {
              traverse(item.children);
            }
          }
        };

        traverse(treeRes.tree);
        setGradeTree(treeRes.tree);
        setGradeMap(gMap);
      }
    } catch (err) {
      console.warn('Could not fetch grade taxonomy tree:', err);
    }
  };

  // 2. Fetch all published exams
  const fetchQuizzes = useCallback(async () => {
    setLoadingQuizzes(true);
    try {
      const exams = await quizApi.listExams();

      const formattedExams = (exams || []).map((e: any) => ({
        id: e.id,
        code: e.code,
        title: e.title,
        description: e.description || `Đề thi ${e.code} (${e.durationMinutes || 45} phút)`,
        durationMinutes: e.durationMinutes || 45,
        isExam: true,
        isPublic: e.isPublished || e.status === 'READY' || e.status === 'ACTIVE',
        questionsCount: e.variants?.[0]?.questionCount || 10,
        passingScore: e.passingScore ?? e.assessment?.passingScore ?? 5,
        primaryNodeId: e.assessment?.primaryTopicNodeId,
        gradeNodeId: e.assessment?.gradeNodeId,
      }));

      setAllQuizzes(formattedExams);
      if (formattedExams.length > 0) {
        setSelectedQuizId((prev) => {
          const exists = formattedExams.some((item) => item.id === prev);
          return exists ? prev : formattedExams[0].id;
        });
      }
    } catch (err) {
      console.warn('Could not fetch exams:', err);
      setAllQuizzes([]);
    } finally {
      setLoadingQuizzes(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchGradeTaxonomy();
    fetchQuizzes();
  }, [fetchQuizzes]);

  // Compute quiz count for each taxonomy node (including descendants)
  const quizCountsByNode = useMemo(() => {
    const counts: Record<string, number> = {};
    const descendants = descendantMapRef.current;

    const countForNode = (nodeId: string): number => {
      const allowed = descendants[nodeId];
      return allQuizzes.filter((q) => {
        if (!q.primaryNodeId) return false;
        if (allowed) return allowed.has(q.primaryNodeId);
        return q.primaryNodeId === nodeId;
      }).length;
    };

    const traverse = (items: TaxonomyTreeNodeDTO[]) => {
      for (const item of items) {
        counts[item.id] = countForNode(item.id);
        if (item.children) {
          traverse(item.children);
        }
      }
    };

    traverse(taxonomyTree);
    return counts;
  }, [taxonomyTree, allQuizzes]);

  // Compute quiz count for each grade taxonomy node (including descendants, respecting current topic selection)
  const gradeCountsByNode = useMemo(() => {
    const counts: Record<string, number> = {};
    const descendants = gradeDescendantMapRef.current;

    // Filter by topic first if active
    const baseQuizzes = !selectedCategoryNodeId
      ? allQuizzes
      : allQuizzes.filter((q) => {
          if (!q.primaryNodeId) return false;
          const allowed = descendantMapRef.current[selectedCategoryNodeId];
          return allowed ? allowed.has(q.primaryNodeId) : q.primaryNodeId === selectedCategoryNodeId;
        });

    const countForNode = (nodeId: string): number => {
      const allowed = descendants[nodeId];
      return baseQuizzes.filter((q) => {
        if (!q.gradeNodeId) return false;
        if (allowed) return allowed.has(q.gradeNodeId);
        return q.gradeNodeId === nodeId;
      }).length;
    };

    const traverse = (items: TaxonomyTreeNodeDTO[]) => {
      for (const item of items) {
        counts[item.id] = countForNode(item.id);
        if (item.children) {
          traverse(item.children);
        }
      }
    };

    traverse(gradeTree);
    return counts;
  }, [gradeTree, allQuizzes, selectedCategoryNodeId]);

  // Filter quizzes based on both selected category node AND selected grade node (2D Facet Filtering - Task 4.2)
  const displayedQuizzes = useMemo(() => {
    return allQuizzes.filter((q) => {
      // 1. Topic filter
      if (selectedCategoryNodeId) {
        if (!q.primaryNodeId) return false;
        const allowedDescendants = descendantMapRef.current[selectedCategoryNodeId];
        if (allowedDescendants) {
          if (!allowedDescendants.has(q.primaryNodeId)) return false;
        } else if (q.primaryNodeId !== selectedCategoryNodeId) {
          return false;
        }
      }

      // 2. Grade filter
      if (selectedGradeNodeId) {
        if (!q.gradeNodeId) return false;
        const allowedGradeDescendants = gradeDescendantMapRef.current[selectedGradeNodeId];
        if (allowedGradeDescendants) {
          if (!allowedGradeDescendants.has(q.gradeNodeId)) return false;
        } else if (q.gradeNodeId !== selectedGradeNodeId) {
          return false;
        }
      }

      return true;
    });
  }, [allQuizzes, selectedCategoryNodeId, selectedGradeNodeId]);

  // Keep selected quiz valid within filtered list
  useEffect(() => {
    if (displayedQuizzes.length > 0) {
      const exists = displayedQuizzes.some((q) => q.id === selectedQuizId);
      if (!exists) {
        setSelectedQuizId(displayedQuizzes[0].id);
      }
    }
  }, [displayedQuizzes, selectedQuizId]);

  const handleSelectNode = (nodeId: string) => {
    setSelectedCategoryNodeId(nodeId);
    setIsMobileSidebarOpen(false); // Close mobile drawer if open
  };

  const selectedNodeName = selectedCategoryNodeId
    ? categoryMap[selectedCategoryNodeId] || 'Chủ đề đã chọn'
    : 'Tất cả bài thi';

  const selectedNodeBreadcrumbs = selectedCategoryNodeId
    ? nodeBreadcrumbMap[selectedCategoryNodeId] || [selectedNodeName]
    : [];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* 1. TOP BAR (HEADER):
          Bên trái: Logo + Tên hệ thống ("Hệ Thống Thi Trắc Nghiệm")
          Bên phải: Avatar nhỏ + Tên học viên + Badge STUDENT + Dropdown menu (Hồ sơ, Đăng xuất)
      */}
      <TopBar
        user={user}
        onOpenProfile={() => setIsProfileOpen(true)}
        onLogout={onLogout}
        onLoginRequest={onLoginRequest}
      />

      {/* Giai đoạn 3: Banner Nhắc nhở & Tự phục hồi Ca thi đang dang dở */}
      {activeAttempt && (
        <aside
          aria-label="Thông báo ca thi đang diễn ra"
          className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-slate-900 border-b border-amber-500/30 px-4 py-3 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shrink-0 animate-in fade-in slide-in-from-top-2 duration-300 z-10"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0 text-lg animate-pulse">
              ⏳
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Phát hiện ca thi đang diễn ra
              </div>
              <div className="text-sm font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                <span>Đề thi:</span>
                <span className="text-amber-200 font-bold">{activeAttempt.title || activeAttempt.examId || activeAttempt.quizId}</span>
                {activeAttempt.remainingMinutes !== undefined && (
                  <span className="text-xs font-normal text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
                    Còn lại khoảng: <strong className="text-amber-300 font-mono font-bold">{activeAttempt.remainingMinutes} phút</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {onResumeActiveAttempt && (
              <button
                type="button"
                onClick={() => onResumeActiveAttempt(activeAttempt)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-amber-500/20"
              >
                <span>Tiếp tục thi ngay</span>
                <span>→</span>
              </button>
            )}
            {onDismissActiveAttempt && (
              <button
                type="button"
                onClick={onDismissActiveAttempt}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 text-xs transition-colors cursor-pointer"
                title="Bỏ qua nhắc nhở"
              >
                <XIcon size={16} />
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Mobile Sidebar Toggle Button for small screens */}
      <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 text-sky-400 font-semibold border border-slate-700"
        >
          <BookOpenIcon size={14} />
          <span>{isMobileSidebarOpen ? 'Đóng cây thư mục' : 'Chọn môn / cây tri thức'}</span>
        </button>
        <span className="text-slate-400 font-medium truncate max-w-[180px]">
          {selectedNodeName}
        </span>
      </div>

      {/* 2. BỐ CỤC BÊN DƯỚI:
          Sidebar bên trái: Cây thư mục Tri thức (Taxonomy Tree) - có thể thu gọn để mở rộng tối đa màn hình
          Khu vực nội dung: Danh sách bài thi dạng Card (5 card trên 1 hàng)
      */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar (Collapsible for maximum exam display space) */}
        {!isSidebarCollapsed && (
          <div className="hidden lg:flex h-full w-64 xl:w-72 shrink-0 border-r border-slate-800/80 transition-all duration-200">
            <TaxonomyTreeSidebar
              tree={taxonomyTree}
              selectedNodeId={selectedCategoryNodeId}
              onSelectNode={handleSelectNode}
              quizCountsByNode={quizCountsByNode}
              totalQuizzesCount={allQuizzes.length}
              isLoading={loadingTree}
              onCollapse={() => setIsSidebarCollapsed(true)}
            />
          </div>
        )}

        {/* Mobile Sidebar Drawer */}
        {isMobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative w-4/5 max-w-xs bg-slate-900 h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-3 border-b border-slate-800">
                <span className="font-bold text-xs text-slate-200">Cây Thư Mục Tri Thức</span>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
                >
                  <XIcon size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <TaxonomyTreeSidebar
                  tree={taxonomyTree}
                  selectedNodeId={selectedCategoryNodeId}
                  onSelectNode={handleSelectNode}
                  quizCountsByNode={quizCountsByNode}
                  totalQuizzesCount={allQuizzes.length}
                  isLoading={loadingTree}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area: Danh sách bài thi dạng Card (5 card trên 1 hàng) */}
        <QuizContentArea
          quizzes={displayedQuizzes}
          selectedNodeName={selectedNodeName}
          selectedNodeBreadcrumbs={selectedNodeBreadcrumbs}
          categoryMap={categoryMap}
          user={user}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onStartQuiz={onStart}
          isLoadingQuizzes={loadingQuizzes}
          gradeTree={gradeTree}
          selectedGradeNodeId={selectedGradeNodeId}
          onSelectGradeNode={setSelectedGradeNodeId}
          gradeMap={gradeMap}
          gradeCounts={gradeCountsByNode}
          onClearCategory={() => setSelectedCategoryNodeId('')}
          onClearGrade={() => setSelectedGradeNodeId('')}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      </div>

      {/* Profile Modal (Opened from TopBar dropdown menu -> Hồ sơ) */}
      <StudentProfileModal
        user={user}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onLogout={onLogout}
      />
    </div>
  );
};
