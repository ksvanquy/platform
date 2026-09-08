import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UserProfile } from '@platform/auth-client';
import type { TaxonomyTreeNodeDTO } from '@platform/contracts';
import { quizApi } from '../api/quiz-api.js';
import { TopBar } from '../components/dashboard/TopBar.js';
import { StudentProfileModal } from '../components/dashboard/StudentProfileModal.js';
import { TaxonomyTreeSidebar } from '../components/dashboard/TaxonomyTreeSidebar.js';
import { QuizContentArea } from '../components/dashboard/QuizContentArea.js';
import { BookOpenIcon, XIcon } from '../components/common/Icons.js';

interface QuizStartViewProps {
  quizId: string;
  user: UserProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
  onStart: (quizId: string) => void;
  onLogout: () => void;
}

export const QuizStartView: React.FC<QuizStartViewProps> = ({
  quizId,
  user,
  isLoading,
  errorMessage,
  onStart,
  onLogout,
}) => {
  const [selectedQuizId, setSelectedQuizId] = useState<string>(quizId || '');
  const [allQuizzes, setAllQuizzes] = useState<any[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState<boolean>(true);
  const [loadingTree, setLoadingTree] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

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

  // Selected quiz details (duration, passingScore, etc.)
  const [quizDetails, setQuizDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

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

  // 2. Fetch all published quizzes and exams
  const fetchQuizzes = useCallback(async () => {
    setLoadingQuizzes(true);
    try {
      const [quizzes, exams] = await Promise.all([
        quizApi.listQuizzes(),
        quizApi.listExams(),
      ]);

      const formattedExams = (exams || []).map((e: any) => ({
        id: e.id,
        code: e.code,
        title: `⚡ [Kỳ Thi] ${e.title}`,
        durationMinutes: e.durationMinutes || 45,
        isExam: true,
        primaryNodeId: e.assessment?.primaryTopicNodeId,
        gradeNodeId: e.assessment?.gradeNodeId,
      }));

      const combined = [...quizzes, ...formattedExams];
      setAllQuizzes(combined);
      if (combined.length > 0 && !selectedQuizId) {
        setSelectedQuizId(combined[0].id);
      }
    } catch (err) {
      console.warn('Could not fetch quizzes or exams:', err);
      setAllQuizzes([]);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [selectedQuizId]);

  // 3. Fetch details for selected quiz
  useEffect(() => {
    let isCancelled = false;
    if (!selectedQuizId) {
      setQuizDetails(null);
      return;
    }

    const loadDetails = async () => {
      setLoadingDetails(true);
      try {
        const details = await quizApi.getQuizDetails(selectedQuizId);
        if (!isCancelled) {
          setQuizDetails(details);
        }
      } catch {
        if (!isCancelled) {
          setQuizDetails(null);
        }
      } finally {
        if (!isCancelled) {
          setLoadingDetails(false);
        }
      }
    };

    loadDetails();
    return () => {
      isCancelled = true;
    };
  }, [selectedQuizId]);

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
      />

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

      {/* 2. BỐ CỤC BÊN DƯỚI (SPLIT VIEW):
          Sidebar bên trái (25% - 30%): Cây thư mục Tri thức (Taxonomy Tree) để chọn môn/chủ đề
          Khu vực nội dung bên phải (70% - 75%): Danh sách bài thi tương ứng + Thông tin ca thi
      */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar (25% - 30%) */}
        <div className="hidden lg:flex h-full w-[28%] xl:w-[25%] max-w-[360px] min-w-[270px] shrink-0 border-r border-slate-800/80">
          <TaxonomyTreeSidebar
            tree={taxonomyTree}
            selectedNodeId={selectedCategoryNodeId}
            onSelectNode={handleSelectNode}
            quizCountsByNode={quizCountsByNode}
            totalQuizzesCount={allQuizzes.length}
            isLoading={loadingTree}
          />
        </div>

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

        {/* Right Content Area (70% - 75%): Danh sách bài thi tương ứng + Thông tin ca thi */}
        <QuizContentArea
          quizzes={displayedQuizzes}
          selectedQuizId={selectedQuizId}
          onSelectQuiz={setSelectedQuizId}
          selectedNodeName={selectedNodeName}
          selectedNodeBreadcrumbs={selectedNodeBreadcrumbs}
          categoryMap={categoryMap}
          user={user}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onStartQuiz={onStart}
          quizDetails={quizDetails}
          loadingDetails={loadingDetails}
          isLoadingQuizzes={loadingQuizzes}
          gradeTree={gradeTree}
          selectedGradeNodeId={selectedGradeNodeId}
          onSelectGradeNode={setSelectedGradeNodeId}
          gradeMap={gradeMap}
          gradeCounts={gradeCountsByNode}
          onClearCategory={() => setSelectedCategoryNodeId('')}
          onClearGrade={() => setSelectedGradeNodeId('')}
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
