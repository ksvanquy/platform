import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/index.js';
import type {
  QuestionDTO,
  QuestionRevisionDTO,
  QuestionDifficulty,
  QuestionType,
  QuestionStatus,
  QuestionOption,
  MatchingPair,
  MediaAsset,
  TaxonomyTreeNodeDTO,
} from '@platform/contracts';
import { MathRenderer } from '../components/MathRenderer.js';

export const QuestionManagementSection: React.FC = () => {
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filters
  const [filterDifficulty, setFilterDifficulty] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterTopic, setFilterTopic] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Taxonomies
  const [topicNodes, setTopicNodes] = useState<{ id: string; name: string }[]>([]);
  const [gradeNodes, setGradeNodes] = useState<{ id: string; name: string }[]>([]);

  // Modal State (Create / Edit Question)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionDTO | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<'edit' | 'preview'>('edit');

  // Form Fields
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<QuestionType>('SINGLE');
  const [formDifficulty, setFormDifficulty] = useState<QuestionDifficulty>('REMEMBER');
  const [formStatus, setFormStatus] = useState<QuestionStatus>('ACTIVE');
  const [formDefaultPoints, setFormDefaultPoints] = useState<number>(1);
  const [formTopicNodeId, setFormTopicNodeId] = useState<string>('');
  const [formGradeNodeId, setFormGradeNodeId] = useState<string>('');
  const [formPrompt, setFormPrompt] = useState<string>('');
  const [formExplanation, setFormExplanation] = useState<string>('');
  const [formOptions, setFormOptions] = useState<QuestionOption[]>([
    { id: 'opt_1', content: '', isCorrect: true, explanation: '' },
    { id: 'opt_2', content: '', isCorrect: false, explanation: '' },
    { id: 'opt_3', content: '', isCorrect: false, explanation: '' },
    { id: 'opt_4', content: '', isCorrect: false, explanation: '' },
  ]);
  const [formMatchingPairs, setFormMatchingPairs] = useState<MatchingPair[]>([
    { leftId: 'l_1', leftText: '', rightId: 'r_1', rightText: '' },
    { leftId: 'l_2', leftText: '', rightId: 'r_2', rightText: '' },
  ]);
  const [formMediaAssets, setFormMediaAssets] = useState<MediaAsset[]>([]);

  // Revision History State
  const [viewingRevisionsQuestion, setViewingRevisionsQuestion] = useState<QuestionDTO | null>(null);
  const [revisionsList, setRevisionsList] = useState<QuestionRevisionDTO[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);

  // Flatten taxonomy tree
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

  const fetchTaxonomies = async () => {
    try {
      const topicRes = await adminApi.taxonomies.getTree('TOPIC');
      if (topicRes.success && topicRes.data?.tree) {
        setTopicNodes(flattenTree(topicRes.data.tree));
      }
      const gradeRes = await adminApi.taxonomies.getTree('GRADE');
      if (gradeRes.success && gradeRes.data?.tree) {
        setGradeNodes(flattenTree(gradeRes.data.tree));
      }
    } catch {
      // ignore
    }
  };

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.questions.list({
        difficulty: filterDifficulty ? (filterDifficulty as QuestionDifficulty) : undefined,
        type: filterType ? (filterType as QuestionType) : undefined,
        status: filterStatus ? (filterStatus as QuestionStatus) : undefined,
        topicNodeId: filterTopic || undefined,
        search: filterSearch.trim() || undefined,
      });

      if (res.success && res.data) {
        setQuestions(res.data);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải câu hỏi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filterDifficulty, filterType, filterStatus, filterTopic, filterSearch]);

  useEffect(() => {
    fetchTaxonomies();
    fetchQuestions();
  }, [fetchQuestions]);

  const openCreateModal = () => {
    setEditingQuestion(null);
    setFormCode(`Q_${Date.now().toString(36).toUpperCase()}`);
    setFormType('SINGLE');
    setFormDifficulty('REMEMBER');
    setFormStatus('ACTIVE');
    setFormDefaultPoints(1);
    setFormTopicNodeId(topicNodes[0]?.id || '');
    setFormGradeNodeId(gradeNodes[0]?.id || '');
    setFormPrompt('');
    setFormExplanation('');
    setFormOptions([
      { id: 'opt_1', content: '', isCorrect: true, explanation: '' },
      { id: 'opt_2', content: '', isCorrect: false, explanation: '' },
      { id: 'opt_3', content: '', isCorrect: false, explanation: '' },
      { id: 'opt_4', content: '', isCorrect: false, explanation: '' },
    ]);
    setFormMatchingPairs([
      { leftId: 'l_1', leftText: '', rightId: 'r_1', rightText: '' },
      { leftId: 'l_2', leftText: '', rightId: 'r_2', rightText: '' },
    ]);
    setFormMediaAssets([]);
    setActiveEditorTab('edit');
    setShowEditorModal(true);
  };

  const openEditModal = (q: QuestionDTO) => {
    setEditingQuestion(q);
    setFormCode(q.code);
    setFormType(q.type);
    setFormDifficulty(q.difficulty);
    setFormStatus(q.status);
    setFormDefaultPoints(q.defaultPoints);
    setFormTopicNodeId(q.topicNodeId || '');
    setFormGradeNodeId(q.gradeNodeId || '');
    setFormPrompt(q.currentRevision?.prompt || '');
    setFormExplanation(q.currentRevision?.explanation || '');
    setFormOptions(
      q.currentRevision?.options && q.currentRevision.options.length > 0
        ? q.currentRevision.options
        : [
            { id: 'opt_1', content: '', isCorrect: true, explanation: '' },
            { id: 'opt_2', content: '', isCorrect: false, explanation: '' },
          ]
    );
    setFormMatchingPairs(
      q.currentRevision?.pairs && q.currentRevision.pairs.length > 0
        ? q.currentRevision.pairs
        : [{ leftId: 'l_1', leftText: '', rightId: 'r_1', rightText: '' }]
    );
    setFormMediaAssets(q.currentRevision?.mediaAssets || []);
    setActiveEditorTab('edit');
    setShowEditorModal(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPrompt.trim()) {
      setStatusMessage('⚠️ Vui lòng nhập nội dung đề bài câu hỏi!');
      return;
    }

    try {
      if (editingQuestion) {
        // Cập nhật thông tin cơ bản
        await adminApi.questions.update(editingQuestion.id, {
          difficulty: formDifficulty,
          defaultPoints: Number(formDefaultPoints),
          status: formStatus,
          topicNodeId: formTopicNodeId || null,
          gradeNodeId: formGradeNodeId || null,
          prompt: formPrompt,
          options: formType !== 'MATCHING' ? formOptions : undefined,
          pairs: formType === 'MATCHING' ? formMatchingPairs : undefined,
          explanation: formExplanation,
          mediaAssets: formMediaAssets,
        });

        // Tạo revision mới cho thay đổi nội dung
        await adminApi.questions.addRevision(editingQuestion.id, {
          prompt: formPrompt,
          options: formType !== 'MATCHING' ? formOptions : [],
          pairs: formType === 'MATCHING' ? formMatchingPairs : undefined,
          explanation: formExplanation,
          mediaAssets: formMediaAssets,
        });

        setStatusMessage(`✅ Đã cập nhật câu hỏi [${formCode}] và ghi nhận Revision mới!`);
      } else {
        // Tạo câu hỏi mới
        await adminApi.questions.create({
          code: formCode.trim().toUpperCase(),
          type: formType,
          difficulty: formDifficulty,
          defaultPoints: Number(formDefaultPoints),
          topicNodeId: formTopicNodeId || null,
          gradeNodeId: formGradeNodeId || null,
          prompt: formPrompt,
          options: formType !== 'MATCHING' ? formOptions : [],
          pairs: formType === 'MATCHING' ? formMatchingPairs : undefined,
          explanation: formExplanation,
          mediaAssets: formMediaAssets,
        });

        setStatusMessage(`✅ Đã tạo câu hỏi mới [${formCode}] vào Ngân hàng câu hỏi!`);
      }

      setShowEditorModal(false);
      await fetchQuestions();
    } catch (err: any) {
      setStatusMessage(`❌ Lưu câu hỏi thất bại: ${err.message}`);
    }
  };

  const handleDeleteQuestion = async (id: string, code: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa câu hỏi "${code}"?`)) return;
    try {
      await adminApi.questions.delete(id);
      setStatusMessage(`✅ Đã xóa câu hỏi [${code}]!`);
      await fetchQuestions();
    } catch (err: any) {
      setStatusMessage(`❌ Xóa câu hỏi thất bại: ${err.message}`);
    }
  };

  const handleOpenRevisions = async (q: QuestionDTO) => {
    setViewingRevisionsQuestion(q);
    setLoadingRevisions(true);
    try {
      const res = await adminApi.questions.listRevisions(q.id);
      if (res.success && res.data) {
        setRevisionsList(res.data);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải lịch sử revisions: ${err.message}`);
    } finally {
      setLoadingRevisions(false);
    }
  };

  // Option editor helpers
  const handleOptionChange = (index: number, field: keyof QuestionOption, val: any) => {
    const updated = [...formOptions];
    updated[index] = { ...updated[index], [field]: val };
    setFormOptions(updated);
  };

  const handleSelectCorrectOption = (selectedIndex: number) => {
    if (formType === 'SINGLE') {
      const updated = formOptions.map((opt, idx) => ({
        ...opt,
        isCorrect: idx === selectedIndex,
      }));
      setFormOptions(updated);
    } else {
      const updated = [...formOptions];
      updated[selectedIndex].isCorrect = !updated[selectedIndex].isCorrect;
      setFormOptions(updated);
    }
  };

  const handleAddOption = () => {
    const nextId = `opt_${formOptions.length + 1}`;
    setFormOptions([...formOptions, { id: nextId, content: '', isCorrect: false }]);
  };

  const handleRemoveOption = (index: number) => {
    if (formOptions.length <= 2) return;
    setFormOptions(formOptions.filter((_, idx) => idx !== index));
  };

  const getDifficultyBadge = (diff: QuestionDifficulty) => {
    switch (diff) {
      case 'REMEMBER':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Nhận biết (Remember)</span>;
      case 'UNDERSTAND':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">Thông hiểu (Understand)</span>;
      case 'APPLY':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Vận dụng (Apply)</span>;
      case 'ANALYZE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">Vận dụng cao (Analyze)</span>;
      default:
        return <span>{diff}</span>;
    }
  };

  const getTypeBadge = (t: QuestionType) => {
    switch (t) {
      case 'SINGLE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/20 text-indigo-300">Trắc nghiệm đơn</span>;
      case 'MULTIPLE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-300">Nhiều đáp án</span>;
      case 'FILL_IN':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300">Điền từ</span>;
      case 'MATCHING':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-500/20 text-teal-300">Nối cặp</span>;
      case 'ESSAY':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-violet-500/20 text-violet-300">Tự luận</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700 text-slate-300">{t}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📝</span>
            <h2 className="text-xl font-black text-slate-100">Ngân Hàng Câu Hỏi Tập Trung (Question Bank)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Authoring độc lập: Soạn thảo RichText & LaTeX thời gian thực, quản lý Media, phân loại Bloom Taxonomy và lưu trữ Revisions lịch sử.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <span>➕</span>
          <span>Soạn Câu Hỏi Mới</span>
        </button>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs sm:text-sm text-slate-200 flex items-center justify-between shadow-lg">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-200 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Search */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Tìm kiếm từ khóa</label>
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Tìm theo nội dung / mã..."
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Bloom Difficulty Filter */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Mức độ nhận thức (Bloom)</label>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Tất cả độ khó</option>
            <option value="REMEMBER">Nhận biết (Remember)</option>
            <option value="UNDERSTAND">Thông hiểu (Understand)</option>
            <option value="APPLY">Vận dụng (Apply)</option>
            <option value="ANALYZE">Vận dụng cao (Analyze)</option>
          </select>
        </div>

        {/* Question Type Filter */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Dạng câu hỏi</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Tất cả các dạng</option>
            <option value="SINGLE">Trắc nghiệm 1 đáp án</option>
            <option value="MULTIPLE">Nhiều đáp án đúng</option>
            <option value="FILL_IN">Điền từ vào chỗ trống</option>
            <option value="MATCHING">Nối cặp (Matching)</option>
            <option value="ESSAY">Tự luận (Essay)</option>
          </select>
        </div>

        {/* Topic Filter */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Chủ đề (Topic)</label>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
          >
            <option value="">Tất cả chủ đề</option>
            {topicNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Trạng thái</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động (Active)</option>
            <option value="DRAFT">Bản nháp (Draft)</option>
            <option value="DEPRECATED">Ngừng dùng (Deprecated)</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Đang tải ngân hàng câu hỏi...</div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-400 text-sm space-y-3">
            <div className="text-3xl">📭</div>
            <p>Chưa có câu hỏi nào khớp với bộ lọc hiện tại.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-500 transition-all"
            >
              Soạn câu hỏi đầu tiên
            </button>
          </div>
        ) : (
          questions.map((q) => {
            const topicName = topicNodes.find((t) => t.id === q.topicNodeId)?.name || 'Chưa gán Topic';
            const gradeName = gradeNodes.find((g) => g.id === q.gradeNodeId)?.name || 'Chưa gán Khối';

            return (
              <div
                key={q.id}
                className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-md hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                      {q.code}
                    </span>
                    {getTypeBadge(q.type)}
                    {getDifficultyBadge(q.difficulty)}
                    <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                      {q.defaultPoints} điểm
                    </span>
                    <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                      Rev #{q.currentRevision?.revisionNumber || 1}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenRevisions(q)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                      title="Xem lịch sử Revisions"
                    >
                      📜 Lịch sử Rev
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(q)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors cursor-pointer"
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id, q.code)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium transition-colors cursor-pointer"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>

                {/* Prompt with LaTeX preview */}
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 font-medium">Nội dung câu hỏi:</div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 text-sm">
                    <MathRenderer content={q.currentRevision?.prompt || 'Chưa có nội dung đề bài.'} />
                  </div>
                </div>

                {/* Options summary */}
                {q.currentRevision?.options && q.currentRevision.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    {q.currentRevision.options.map((opt, oIdx) => (
                      <div
                        key={opt.id || oIdx}
                        className={`p-2.5 rounded-xl border flex items-start space-x-2 ${
                          opt.isCorrect
                            ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                            : 'bg-slate-950/40 border-slate-800/50 text-slate-300'
                        }`}
                      >
                        <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                        <div className="flex-1">
                          <MathRenderer content={opt.content} />
                        </div>
                        {opt.isCorrect && <span className="text-emerald-400 text-[11px] font-bold">✓ Đúng</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanation */}
                {q.currentRevision?.explanation && (
                  <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/40 text-xs text-indigo-300 space-y-1">
                    <span className="font-bold">💡 Lời giải chi tiết:</span>
                    <MathRenderer content={q.currentRevision.explanation} />
                  </div>
                )}

                {/* Taxonomy Footnote */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400 border-t border-slate-800/50">
                  <span>
                    🏷️ <strong className="text-slate-300">Chủ đề:</strong> {topicName}
                  </span>
                  <span>•</span>
                  <span>
                    🎓 <strong className="text-slate-300">Khối:</strong> {gradeName}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Question Editor Modal (Create / Edit with Live LaTeX Preview) */}
      {showEditorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {editingQuestion ? `Chỉnh sửa câu hỏi [${formCode}]` : 'Soạn câu hỏi mới vào Ngân hàng'}
                </h3>
                <p className="text-xs text-slate-400">
                  Hỗ trợ công thức toán học KaTeX ($...$ và $$...$$), đa dạng loại câu hỏi, phân loại Bloom và media.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditorModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-6 text-xs sm:text-sm">
              {/* Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Mã câu hỏi (Code) *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    disabled={!!editingQuestion}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Dạng câu hỏi</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="SINGLE">Trắc nghiệm 1 đáp án (Single)</option>
                    <option value="MULTIPLE">Nhiều đáp án đúng (Multiple)</option>
                    <option value="FILL_IN">Điền từ vào chỗ trống (Fill-in)</option>
                    <option value="MATCHING">Nối cặp (Matching)</option>
                    <option value="ESSAY">Tự luận chấm điểm (Essay)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Mức độ nhận thức (Bloom)</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as QuestionDifficulty)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="REMEMBER">Nhận biết (Remember)</option>
                    <option value="UNDERSTAND">Thông hiểu (Understand)</option>
                    <option value="APPLY">Vận dụng (Apply)</option>
                    <option value="ANALYZE">Vận dụng cao (Analyze)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Điểm mặc định</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={formDefaultPoints}
                    onChange={(e) => setFormDefaultPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Chủ đề (Topic Node)</label>
                  <select
                    value={formTopicNodeId}
                    onChange={(e) => setFormTopicNodeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    <option value="">-- Chưa chọn chủ đề --</option>
                    {topicNodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Khối lớp (Grade Node)</label>
                  <select
                    value={formGradeNodeId}
                    onChange={(e) => setFormGradeNodeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    <option value="">-- Chưa chọn khối lớp --</option>
                    {gradeNodes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prompt Editor & Live Preview Tabs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold">
                    Nội dung câu hỏi (Prompt) <span className="text-indigo-400">*</span>
                  </label>
                  <div className="flex space-x-1 p-1 rounded-xl bg-slate-800 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setActiveEditorTab('edit')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        activeEditorTab === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ✏️ Soạn thảo
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveEditorTab('preview')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        activeEditorTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      👁️ Xem trước KaTeX
                    </button>
                  </div>
                </div>

                {activeEditorTab === 'edit' ? (
                  <div className="space-y-1">
                    <textarea
                      required
                      rows={4}
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      placeholder="Nhập nội dung câu hỏi... Dùng $x^2 + y^2 = r^2$ hoặc $$\int_{0}^{1} x dx$$ cho công thức toán."
                      className="w-full p-3.5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Mẹo: Kẹp công thức giữa cặp dấu $ hoặc $$ để render KaTeX chuẩn xác.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 min-h-[100px]">
                    <MathRenderer content={formPrompt || '*(Chưa có nội dung)*'} />
                  </div>
                )}
              </div>

              {/* Options Editor (for SINGLE / MULTIPLE / FILL_IN) */}
              {formType !== 'MATCHING' && (
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">
                      Danh sách Lựa chọn Đáp án ({formType === 'SINGLE' ? 'Chọn 1 đáp án đúng' : 'Đánh dấu các đáp án đúng'})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium"
                    >
                      ➕ Thêm phương án
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formOptions.map((opt, idx) => (
                      <div
                        key={opt.id || idx}
                        className={`p-3 rounded-2xl border flex items-center space-x-3 transition-colors ${
                          opt.isCorrect ? 'bg-emerald-950/20 border-emerald-700/50' : 'bg-slate-800/40 border-slate-700/60'
                        }`}
                      >
                        {/* Radio or Checkbox */}
                        <button
                          type="button"
                          onClick={() => handleSelectCorrectOption(idx)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                            opt.isCorrect
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                          title="Đánh dấu đáp án đúng"
                        >
                          {opt.isCorrect ? '✓' : String.fromCharCode(65 + idx)}
                        </button>

                        {/* Content */}
                        <input
                          type="text"
                          required
                          value={opt.content}
                          onChange={(e) => handleOptionChange(idx, 'content', e.target.value)}
                          placeholder={`Nội dung phương án ${String.fromCharCode(65 + idx)} (hỗ trợ $formula$)`}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                        />

                        {/* Delete option */}
                        {formOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="text-slate-500 hover:text-rose-400 text-xs px-2"
                            title="Xóa phương án"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matching Pairs Editor (for MATCHING) */}
              {formType === 'MATCHING' && (
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">Cặp nối ghép (Matching Pairs)</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormMatchingPairs([
                          ...formMatchingPairs,
                          {
                            leftId: `l_${formMatchingPairs.length + 1}`,
                            leftText: '',
                            rightId: `r_${formMatchingPairs.length + 1}`,
                            rightText: '',
                          },
                        ])
                      }
                      className="text-xs px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium"
                    >
                      ➕ Thêm cặp nối
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formMatchingPairs.map((pair, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-800/40 border border-slate-700 flex items-center space-x-3">
                        <span className="font-mono text-xs text-slate-400">{idx + 1}.</span>
                        <input
                          type="text"
                          value={pair.leftText}
                          onChange={(e) => {
                            const updated = [...formMatchingPairs];
                            updated[idx].leftText = e.target.value;
                            setFormMatchingPairs(updated);
                          }}
                          placeholder="Vế trái (Khái niệm)..."
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs"
                        />
                        <span className="text-slate-500">➔</span>
                        <input
                          type="text"
                          value={pair.rightText}
                          onChange={(e) => {
                            const updated = [...formMatchingPairs];
                            updated[idx].rightText = e.target.value;
                            setFormMatchingPairs(updated);
                          }}
                          placeholder="Vế phải (Định nghĩa tương ứng)..."
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs"
                        />
                        {formMatchingPairs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormMatchingPairs(formMatchingPairs.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 text-xs px-2"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanation Editor */}
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <label className="text-slate-300 font-bold block">
                  💡 Lời giải chi tiết (Explanation)
                </label>
                <textarea
                  rows={2}
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Giải thích các bước tính toán, phương pháp giải hoặc dẫn chứng lý thuyết..."
                  className="w-full p-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditorModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-all cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  {editingQuestion ? 'Lưu Thay Đổi & Tạo Revision' : 'Tạo Câu Hỏi Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revisions History Drawer Modal */}
      {viewingRevisionsQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  Lịch sử Revisions: [{viewingRevisionsQuestion.code}]
                </h3>
                <p className="text-xs text-slate-400">
                  Tất cả các phiên bản đã được lưu vết và bảo toàn tính bất biến trong lịch sử thi cử.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRevisionsQuestion(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {loadingRevisions ? (
              <div className="p-8 text-center text-slate-400 text-xs">Đang tải lịch sử...</div>
            ) : revisionsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">Chưa có bản ghi revision nào.</div>
            ) : (
              <div className="space-y-4">
                {revisionsList.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/60 pb-2">
                      <span className="font-bold text-indigo-400">Phiên bản #{rev.revisionNumber}</span>
                      <span>{new Date(rev.createdAt).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="text-slate-200">
                      <MathRenderer content={rev.prompt} />
                    </div>
                    {rev.options && rev.options.length > 0 && (
                      <div className="text-[11px] text-slate-400">
                        Số lựa chọn: {rev.options.length} | Đáp án đúng:{' '}
                        {rev.options
                          .map((o, idx) => (o.isCorrect ? String.fromCharCode(65 + idx) : null))
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400">Tác giả: {rev.createdBy}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
