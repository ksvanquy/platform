import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/index.js';
import type { TaxonomyTreeNodeDTO } from '@platform/contracts';

interface QuizItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  isPublic: boolean;
  primaryNodeId?: string | null;
  currentPublishedVersionId?: string;
}

export const QuizManagementSection: React.FC = () => {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Taxonomy nodes for selection & name lookup
  const [topicNodes, setTopicNodes] = useState<{ id: string; name: string }[]>([]);
  const [nodeFilter, setNodeFilter] = useState<string>('');

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createIsPublic, setCreateIsPublic] = useState(false);
  const [createPrimaryNodeId, setCreatePrimaryNodeId] = useState<string>('');

  // Edit modal state
  const [editingQuiz, setEditingQuiz] = useState<QuizItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editPrimaryNodeId, setEditPrimaryNodeId] = useState<string>('');

  const flattenTree = (nodes: TaxonomyTreeNodeDTO[]): { id: string; name: string }[] => {
    const res: { id: string; name: string }[] = [];
    const traverse = (items: TaxonomyTreeNodeDTO[], prefix = '') => {
      for (const item of items) {
        res.push({ id: item.id, name: prefix ? `${prefix} > ${item.name}` : item.name });
        if (item.children && item.children.length > 0) {
          traverse(item.children, prefix ? `${prefix} > ${item.name}` : item.name);
        }
      }
    };
    traverse(nodes);
    return res;
  };

  const fetchTopics = async () => {
    try {
      const res = await adminApi.taxonomies.getTree('TOPIC');
      if (res.success && res.data?.tree) {
        setTopicNodes(flattenTree(res.data.tree));
      }
    } catch {
      // ignore
    }
  };

  const fetchQuizzes = useCallback(async (nodeId?: string) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const list = await adminApi.listQuizzes(nodeId ? { nodeId } : undefined);
      setQuizzes(list || []);
    } catch (err: any) {
      setStatusMessage(`⚠️ Không thể tải danh sách đề thi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    fetchQuizzes(nodeFilter || undefined);
  }, [nodeFilter, fetchQuizzes]);

  const handleOpenEdit = (quiz: QuizItem) => {
    setEditingQuiz(quiz);
    setEditTitle(quiz.title);
    setEditDesc(quiz.description || '');
    setEditIsPublic(Boolean(quiz.isPublic));
    setEditPrimaryNodeId(quiz.primaryNodeId || '');
  };

  const handleUpdateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuiz) return;

    setStatusMessage(null);
    try {
      const res = await adminApi.updateQuiz(editingQuiz.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        isPublic: editIsPublic,
        primaryNodeId: editPrimaryNodeId ? editPrimaryNodeId : null,
      });

      if (res) {
        setStatusMessage(`✅ Đã cập nhật đề thi "${editTitle}" thành công!`);
        setEditingQuiz(null);
        await fetchQuizzes(nodeFilter || undefined);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi khi cập nhật: ${err.message}`);
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCode.trim() || !createTitle.trim()) return;

    setStatusMessage(null);
    try {
      const res = await adminApi.createQuiz({
        code: createCode.trim().toUpperCase(),
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
        isPublic: createIsPublic,
        primaryNodeId: createPrimaryNodeId ? createPrimaryNodeId : null,
      });

      if (res) {
        setStatusMessage(`✅ Đã tạo đề thi "${createTitle}" thành công (Trạng thái DRAFT)!`);
        setShowCreateModal(false);
        setCreateCode('');
        setCreateTitle('');
        setCreateDesc('');
        setCreateIsPublic(false);
        setCreatePrimaryNodeId('');
        await fetchQuizzes(nodeFilter || undefined);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi khi tạo đề thi: ${err.message}`);
    }
  };

  const getNodeName = (nodeId?: string | null) => {
    if (!nodeId) return 'Chưa gán chủ đề';
    const found = topicNodes.find((n) => n.id === nodeId);
    return found ? found.name : nodeId;
  };

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📚</span>
            <h3 className="text-lg font-bold text-slate-100">
              Quản Lý Đề Thi & Gán Cây Tri Thức (Primary Node)
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Xem danh mục đề thi, gán <code className="text-indigo-300">primary_node_id</code> liên kết với Cây phân loại (Taxonomy).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
          >
            + Tạo Đề Thi Mới
          </button>
          <button
            type="button"
            onClick={() => fetchQuizzes(nodeFilter || undefined)}
            disabled={loading}
            className="px-3 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* Filter by Taxonomy Node */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 shrink-0">Lọc theo Chủ đề:</span>
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-72"
          >
            <option value="">[Tất cả các chủ đề]</option>
            {topicNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs font-mono text-slate-500">
          Tổng số đề thi: {quizzes.length}
        </span>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
            statusMessage.startsWith('✅')
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Quizzes Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold">
              <th className="py-2.5 px-3">Mã & Tiêu Đề Đề Thi</th>
              <th className="py-2.5 px-3">Chủ Đề (Primary Node ID)</th>
              <th className="py-2.5 px-3">Trạng Thái</th>
              <th className="py-2.5 px-3 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {quizzes.map((q) => {
              const nodeTitle = getNodeName(q.primaryNodeId);
              return (
                <tr key={q.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200 flex items-center space-x-2">
                      <span>{q.title}</span>
                      {q.isPublic ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Công khai
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          Nội bộ
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Code: {q.code} • ID: {q.id}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {q.primaryNodeId ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        🏷️ {nodeTitle}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[11px]">
                        Chưa liên kết node
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        q.status === 'PUBLISHED'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(q)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-all"
                    >
                      ✏️ Cập nhật & Gán Node
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Cập Nhật Đề Thi & Gán Node */}
      {editingQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-slate-100">
              Cập Nhật Đề Thi: {editingQuiz.code}
            </h4>

            <form onSubmit={handleUpdateQuiz} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tiêu đề</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Mô tả</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Chủ Đề Phân Loại (primary_node_id)
                </label>
                <select
                  value={editPrimaryNodeId}
                  onChange={(e) => setEditPrimaryNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">[Không liên kết node]</option>
                  {topicNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} (ID: {n.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsPublic"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="editIsPublic" className="text-xs text-slate-300">
                  Công khai đề thi (isPublic)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingQuiz(null)}
                  className="px-3.5 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tạo Đề Thi Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-slate-100">
              Khởi Tạo Đề Thi Mới (DRAFT)
            </h4>

            <form onSubmit={handleCreateQuiz} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Mã Đề Thi (Code)</label>
                <input
                  type="text"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                  placeholder="ví dụ: REACT_ADVANCED"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tiêu Đề</label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="ví dụ: Đề Thi ReactJS Nâng Cao"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Mô Tả</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Mô tả nội dung bài thi..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Chủ Đề Phân Loại (primary_node_id)
                </label>
                <select
                  value={createPrimaryNodeId}
                  onChange={(e) => setCreatePrimaryNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">[Không liên kết node]</option>
                  {topicNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} (ID: {n.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="createIsPublic"
                  checked={createIsPublic}
                  onChange={(e) => setCreateIsPublic(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="createIsPublic" className="text-xs text-slate-300">
                  Công khai đề thi cho thí sinh tự do (isPublic)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all"
                >
                  Khởi Tạo Đề Thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
