import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/index.js';
import type {
  AssessmentDTO,
  BlueprintCriterion,
  ScoringPolicyConfig,
  AssessmentStatus,
  QuestionDifficulty,
  TaxonomyTreeNodeDTO,
} from '@platform/contracts';

export const AssessmentManagementSection: React.FC = () => {
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filter
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Taxonomies
  const [topicNodes, setTopicNodes] = useState<{ id: string; name: string }[]>([]);
  const [gradeNodes, setGradeNodes] = useState<{ id: string; name: string }[]>([]);

  // Create / Edit Assessment Info Modal
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<AssessmentDTO | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrimaryTopicNodeId, setFormPrimaryTopicNodeId] = useState('');
  const [formGradeNodeId, setFormGradeNodeId] = useState('');

  // Blueprint Builder Modal
  const [activeBlueprintAssessment, setActiveBlueprintAssessment] = useState<AssessmentDTO | null>(null);
  const [bpDuration, setBpDuration] = useState<number>(45);
  const [bpPassingPercentage, setBpPassingPercentage] = useState<number>(60);
  const [bpMaxAttempts, setBpMaxAttempts] = useState<number>(1);
  const [bpCriteria, setBpCriteria] = useState<BlueprintCriterion[]>([]);
  const [bpScoringPolicy, setBpScoringPolicy] = useState<ScoringPolicyConfig>({
    strategyType: 'STANDARD',
    negativeMarkingPenalty: 0,
    roundingDecimal: 2,
    partialScoringThreshold: 0.5,
  });
  const [bpIsLocked, setBpIsLocked] = useState<boolean>(false);
  const [savingBlueprint, setSavingBlueprint] = useState(false);

  // Flatten taxonomy
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

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.assessments.list({
        status: filterStatus ? (filterStatus as AssessmentStatus) : undefined,
        search: filterSearch.trim() || undefined,
      });
      if (res.success && res.data) {
        setAssessments(res.data);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải bài đánh giá: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSearch]);

  useEffect(() => {
    fetchTaxonomies();
    fetchAssessments();
  }, [fetchAssessments]);

  // Assessment Info Modal handlers
  const openCreateAssessmentModal = () => {
    setEditingAssessment(null);
    setFormCode(`ASM_${Date.now().toString(36).toUpperCase()}`);
    setFormTitle('');
    setFormDesc('');
    setFormPrimaryTopicNodeId(topicNodes[0]?.id || '');
    setFormGradeNodeId(gradeNodes[0]?.id || '');
    setShowAssessmentModal(true);
  };

  const openEditAssessmentModal = (asm: AssessmentDTO) => {
    setEditingAssessment(asm);
    setFormCode(asm.code);
    setFormTitle(asm.title);
    setFormDesc(asm.description || '');
    setFormPrimaryTopicNodeId(asm.primaryTopicNodeId || '');
    setFormGradeNodeId(asm.gradeNodeId || '');
    setShowAssessmentModal(true);
  };

  const handleSaveAssessmentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setStatusMessage('⚠️ Vui lòng nhập tiêu đề bài đánh giá!');
      return;
    }

    try {
      if (editingAssessment) {
        await adminApi.assessments.update(editingAssessment.id, {
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          primaryTopicNodeId: formPrimaryTopicNodeId || null,
          gradeNodeId: formGradeNodeId || null,
        });
        setStatusMessage(`✅ Đã cập nhật bài đánh giá [${formCode}]!`);
      } else {
        await adminApi.assessments.create({
          code: formCode.trim().toUpperCase(),
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          primaryTopicNodeId: formPrimaryTopicNodeId || null,
          gradeNodeId: formGradeNodeId || null,
          durationMinutes: 45,
          passingPercentage: 60,
          maxAttempts: 1,
          criteria: [
            {
              topicNodeId: formPrimaryTopicNodeId || 'node_math_algebra',
              difficulty: 'REMEMBER',
              questionCount: 4,
              pointsPerQuestion: 1,
            },
            {
              topicNodeId: formPrimaryTopicNodeId || 'node_math_algebra',
              difficulty: 'UNDERSTAND',
              questionCount: 4,
              pointsPerQuestion: 1,
            },
            {
              topicNodeId: formPrimaryTopicNodeId || 'node_math_algebra',
              difficulty: 'APPLY',
              questionCount: 2,
              pointsPerQuestion: 1,
            },
          ],
        });
        setStatusMessage(`✅ Đã tạo bài đánh giá mới [${formCode}] cùng Blueprint khởi tạo!`);
      }

      setShowAssessmentModal(false);
      await fetchAssessments();
    } catch (err: any) {
      setStatusMessage(`❌ Lưu bài đánh giá thất bại: ${err.message}`);
    }
  };

  // Status Change Handler
  const handleChangeStatus = async (id: string, newStatus: AssessmentStatus) => {
    try {
      await adminApi.assessments.updateStatus(id, newStatus);
      setStatusMessage(`✅ Đã chuyển trạng thái bài đánh giá sang [${newStatus}]!`);
      await fetchAssessments();
    } catch (err: any) {
      setStatusMessage(`❌ Chuyển trạng thái thất bại: ${err.message}`);
    }
  };

  // Blueprint Builder Modal handlers
  const openBlueprintBuilder = (asm: AssessmentDTO) => {
    setActiveBlueprintAssessment(asm);
    const bp = asm.currentBlueprint;
    if (bp) {
      setBpDuration(bp.durationMinutes || 45);
      setBpPassingPercentage(bp.passingPercentage || 60);
      setBpMaxAttempts(bp.maxAttempts || 1);
      setBpCriteria(bp.criteria && bp.criteria.length > 0 ? bp.criteria : []);
      setBpScoringPolicy(
        bp.scoringPolicy || {
          strategyType: 'STANDARD',
          negativeMarkingPenalty: 0,
          roundingDecimal: 2,
        }
      );
      setBpIsLocked(!!bp.isLocked);
    } else {
      setBpDuration(45);
      setBpPassingPercentage(60);
      setBpMaxAttempts(1);
      setBpCriteria([
        {
          topicNodeId: asm.primaryTopicNodeId || topicNodes[0]?.id || 'topic_root',
          difficulty: 'REMEMBER',
          questionCount: 4,
          pointsPerQuestion: 1,
        },
      ]);
      setBpScoringPolicy({
        strategyType: 'STANDARD',
        negativeMarkingPenalty: 0,
        roundingDecimal: 2,
      });
      setBpIsLocked(false);
    }
  };

  const handleAddCriterion = () => {
    const defaultTopic =
      activeBlueprintAssessment?.primaryTopicNodeId || topicNodes[0]?.id || 'topic_default';
    setBpCriteria([
      ...bpCriteria,
      {
        topicNodeId: defaultTopic,
        difficulty: 'UNDERSTAND',
        questionCount: 2,
        pointsPerQuestion: 1,
      },
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    setBpCriteria(bpCriteria.filter((_, idx) => idx !== index));
  };

  const handleCriterionChange = (index: number, field: keyof BlueprintCriterion, val: any) => {
    const updated = [...bpCriteria];
    updated[index] = { ...updated[index], [field]: val };
    setBpCriteria(updated);
  };

  const handleSaveBlueprint = async () => {
    if (!activeBlueprintAssessment) return;
    setSavingBlueprint(true);
    try {
      await adminApi.assessments.updateBlueprint(activeBlueprintAssessment.id, {
        durationMinutes: Number(bpDuration),
        passingPercentage: Number(bpPassingPercentage),
        maxAttempts: Number(bpMaxAttempts),
        criteria: bpCriteria.map((c) => ({
          topicNodeId: c.topicNodeId,
          difficulty: c.difficulty,
          questionCount: Number(c.questionCount),
          pointsPerQuestion: Number(c.pointsPerQuestion),
        })),
        scoringPolicy: bpScoringPolicy,
      });
      setStatusMessage(`✅ Đã lưu cấu hình Ma trận Blueprint cho [${activeBlueprintAssessment.code}]!`);
      setActiveBlueprintAssessment(null);
      await fetchAssessments();
    } catch (err: any) {
      setStatusMessage(`❌ Lưu ma trận blueprint thất bại: ${err.message}`);
    } finally {
      setSavingBlueprint(false);
    }
  };

  const handleLockBlueprint = async () => {
    if (!activeBlueprintAssessment) return;
    if (
      !confirm(
        '⚠️ BẠN CÓ CHẮC MUỐN KHÓA BLUEPRINT NÀY?\nSau khi khóa, ma trận sẽ đóng băng để đảm bảo tính bất biến khi sinh đề thi (Exam Generation).'
      )
    ) {
      return;
    }

    try {
      await adminApi.assessments.lockBlueprint(activeBlueprintAssessment.id);
      setStatusMessage(`🔒 Đã khóa thành công Ma trận Blueprint [${activeBlueprintAssessment.code}]!`);
      setBpIsLocked(true);
      await fetchAssessments();
    } catch (err: any) {
      setStatusMessage(`❌ Khóa blueprint thất bại: ${err.message}`);
    }
  };

  // Matrix Stats calculations
  const totalQuestions = bpCriteria.reduce((sum, c) => sum + (Number(c.questionCount) || 0), 0);
  const totalPoints = bpCriteria.reduce(
    (sum, c) => sum + (Number(c.questionCount) || 0) * (Number(c.pointsPerQuestion) || 0),
    0
  );

  const countByBloom = {
    REMEMBER: bpCriteria.filter((c) => c.difficulty === 'REMEMBER').reduce((s, c) => s + (Number(c.questionCount) || 0), 0),
    UNDERSTAND: bpCriteria.filter((c) => c.difficulty === 'UNDERSTAND').reduce((s, c) => s + (Number(c.questionCount) || 0), 0),
    APPLY: bpCriteria.filter((c) => c.difficulty === 'APPLY').reduce((s, c) => s + (Number(c.questionCount) || 0), 0),
    ANALYZE: bpCriteria.filter((c) => c.difficulty === 'ANALYZE').reduce((s, c) => s + (Number(c.questionCount) || 0), 0),
  };

  const percentBloom = {
    REMEMBER: totalQuestions > 0 ? Math.round((countByBloom.REMEMBER / totalQuestions) * 100) : 0,
    UNDERSTAND: totalQuestions > 0 ? Math.round((countByBloom.UNDERSTAND / totalQuestions) * 100) : 0,
    APPLY: totalQuestions > 0 ? Math.round((countByBloom.APPLY / totalQuestions) * 100) : 0,
    ANALYZE: totalQuestions > 0 ? Math.round((countByBloom.ANALYZE / totalQuestions) * 100) : 0,
  };

  const getStatusBadge = (status: AssessmentStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700/60 text-slate-300 border border-slate-600/50">Bản nháp (Draft)</span>;
      case 'REVIEW':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Đang thẩm định (Review)</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Đã phê duyệt (Approved)</span>;
      case 'ARCHIVED':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Lưu trữ (Archived)</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📐</span>
            <h2 className="text-xl font-black text-slate-100">Quản Lý Khung Đánh Giá & Ma Trận Đề Thi</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Assessment Service: Quản lý vòng đời (DRAFT ➔ REVIEW ➔ APPROVED ➔ ARCHIVED), cấu hình tỷ lệ ma trận Bloom Taxonomy và khóa Blueprint bất biến.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateAssessmentModal}
          className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <span>➕</span>
          <span>Tạo Bài Đánh Giá Mới</span>
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
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col sm:flex-row gap-3 text-xs">
        <div className="flex-1">
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề hoặc mã bài đánh giá..."
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="w-full sm:w-64">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Tất cả trạng thái vòng đời</option>
            <option value="DRAFT">Bản nháp (Draft)</option>
            <option value="REVIEW">Đang thẩm định (Review)</option>
            <option value="APPROVED">Đã phê duyệt (Approved)</option>
            <option value="ARCHIVED">Lưu trữ (Archived)</option>
          </select>
        </div>
      </div>

      {/* Assessment Cards List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Đang tải danh sách bài đánh giá...</div>
        ) : assessments.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-400 text-sm space-y-3">
            <div className="text-3xl">📭</div>
            <p>Chưa có bài đánh giá nào.</p>
            <button
              type="button"
              onClick={openCreateAssessmentModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-500 transition-all"
            >
              Tạo bài đánh giá đầu tiên
            </button>
          </div>
        ) : (
          assessments.map((asm) => {
            const topicName = topicNodes.find((t) => t.id === asm.primaryTopicNodeId)?.name || 'Chưa gán Topic';
            const gradeName = gradeNodes.find((g) => g.id === asm.gradeNodeId)?.name || 'Chưa gán Khối';
            const bp = asm.currentBlueprint;
            const criteriaCount = bp?.criteria?.length || 0;
            const bpQuestionsTotal = bp?.criteria?.reduce((acc, c) => acc + c.questionCount, 0) || 0;

            return (
              <div
                key={asm.id}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-md hover:border-slate-700 transition-all space-y-4"
              >
                {/* Title & Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                        {asm.code}
                      </span>
                      {getStatusBadge(asm.status)}
                      {bp?.isLocked ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/40 text-amber-400 border border-amber-800/60">
                          🔒 Ma trận đã khóa
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-800/60">
                          🔓 Ma trận đang mở
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-100">{asm.title}</h3>
                    {asm.description && <p className="text-xs text-slate-400">{asm.description}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                    {/* Status transition actions */}
                    <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-800 border border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => handleChangeStatus(asm.id, 'DRAFT')}
                        disabled={asm.status === 'DRAFT'}
                        className={`px-2 py-1 rounded-lg font-medium transition-all ${
                          asm.status === 'DRAFT' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeStatus(asm.id, 'REVIEW')}
                        disabled={asm.status === 'REVIEW'}
                        className={`px-2 py-1 rounded-lg font-medium transition-all ${
                          asm.status === 'REVIEW' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeStatus(asm.id, 'APPROVED')}
                        disabled={asm.status === 'APPROVED'}
                        className={`px-2 py-1 rounded-lg font-medium transition-all ${
                          asm.status === 'APPROVED' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Approved
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeStatus(asm.id, 'ARCHIVED')}
                        disabled={asm.status === 'ARCHIVED'}
                        className={`px-2 py-1 rounded-lg font-medium transition-all ${
                          asm.status === 'ARCHIVED' ? 'bg-rose-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Archive
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openBlueprintBuilder(asm)}
                      className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5"
                    >
                      <span>📐</span>
                      <span>Ma Trận Blueprint</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditAssessmentModal(asm)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                    >
                      ✏️ Sửa
                    </button>
                  </div>
                </div>

                {/* Blueprint Parameters Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">⏱️ Thời gian thi:</span>
                    <strong className="text-slate-200 text-sm">{bp?.durationMinutes || 45} phút</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">🎯 Điểm chuẩn đạt:</span>
                    <strong className="text-slate-200 text-sm">{bp?.passingPercentage || 60}%</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">🔁 Số lượt tối đa:</span>
                    <strong className="text-slate-200 text-sm">{bp?.maxAttempts || 1} lần</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">📊 Tổng câu ma trận:</span>
                    <strong className="text-indigo-400 text-sm">{bpQuestionsTotal} câu ({criteriaCount} nhóm)</strong>
                  </div>
                </div>

                {/* Taxonomy Footnote */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400 border-t border-slate-800/50">
                  <span>
                    🏷️ <strong className="text-slate-300">Chủ đề:</strong> {topicName}
                  </span>
                  <span>•</span>
                  <span>
                    🎓 <strong className="text-slate-300">Khối:</strong> {gradeName}
                  </span>
                  <span>•</span>
                  <span>Tạo lúc: {new Date(asm.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Assessment Info Modal (Create / Edit) */}
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {editingAssessment ? `Chỉnh sửa [${formCode}]` : 'Tạo Bài Đánh Giá Mới'}
                </h3>
                <p className="text-xs text-slate-400">Khung đặc tả bài đánh giá độc lập (Assessment Service)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssessmentModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAssessmentInfo} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Mã bài đánh giá (Code) *</label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  disabled={!!editingAssessment}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tiêu đề bài đánh giá *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Kiểm tra Giữa kỳ Toán học Kỳ 1"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Mô tả mục tiêu đánh giá</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Mô tả phạm vi kiến thức và yêu cầu năng lực..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Chủ đề chính (Topic)</label>
                  <select
                    value={formPrimaryTopicNodeId}
                    onChange={(e) => setFormPrimaryTopicNodeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    <option value="">-- Chọn chủ đề --</option>
                    {topicNodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Khối lớp (Grade)</label>
                  <select
                    value={formGradeNodeId}
                    onChange={(e) => setFormGradeNodeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 truncate"
                  >
                    <option value="">-- Chọn khối lớp --</option>
                    {gradeNodes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAssessmentModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all"
                >
                  {editingAssessment ? 'Lưu Thay Đổi' : 'Tạo Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Blueprint Builder Modal (Ma Trận Đề Thi Trực Quan) */}
      {activeBlueprintAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-slate-100">
                    Ma Trận Đề Thi (Blueprint Builder) - [{activeBlueprintAssessment.code}]
                  </h3>
                  {bpIsLocked ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                      🔒 ĐÃ KHÓA
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      🔓 ĐANG MỞ SOẠN THẢO
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Thiết lập phân bổ tỷ lệ mức độ nhận thức theo Bloom Taxonomy, thời gian và chính sách tính điểm.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {!bpIsLocked && (
                  <button
                    type="button"
                    onClick={handleLockBlueprint}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
                    title="Khóa ma trận trước khi sinh kỳ thi"
                  >
                    🔒 Khóa Blueprint
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveBlueprintAssessment(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Exam Parameters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Thời gian làm bài (Phút)</label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  disabled={bpIsLocked}
                  value={bpDuration}
                  onChange={(e) => setBpDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tỷ lệ đạt chuẩn (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={bpIsLocked}
                  value={bpPassingPercentage}
                  onChange={(e) => setBpPassingPercentage(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Số lượt làm bài tối đa</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  disabled={bpIsLocked}
                  value={bpMaxAttempts}
                  onChange={(e) => setBpMaxAttempts(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Scoring Policy Row */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
              <div className="font-bold text-slate-300">Chính Sách Chấm Điểm (Scoring Policy):</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Chiến lược tính điểm</label>
                  <select
                    disabled={bpIsLocked}
                    value={bpScoringPolicy.strategyType}
                    onChange={(e) =>
                      setBpScoringPolicy({
                        ...bpScoringPolicy,
                        strategyType: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 disabled:opacity-50"
                  >
                    <option value="STANDARD">Chuẩn (Standard)</option>
                    <option value="PARTIAL">Tính điểm từng phần (Partial)</option>
                    <option value="ALL_OR_NOTHING">Đúng toàn bộ mới có điểm (All or Nothing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Trừ điểm câu sai (Negative Penalty)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    disabled={bpIsLocked}
                    value={bpScoringPolicy.negativeMarkingPenalty || 0}
                    onChange={(e) =>
                      setBpScoringPolicy({
                        ...bpScoringPolicy,
                        negativeMarkingPenalty: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Làm tròn số thập phân</label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    disabled={bpIsLocked}
                    value={bpScoringPolicy.roundingDecimal ?? 2}
                    onChange={(e) =>
                      setBpScoringPolicy({
                        ...bpScoringPolicy,
                        roundingDecimal: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Bloom Taxonomy Live Distribution Summary */}
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-900/40 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="font-bold text-indigo-300">
                  Phân bổ Bloom Taxonomy: Tổng cộng {totalQuestions} câu hỏi | {totalPoints} điểm
                </div>
                <div className="flex items-center space-x-3 text-[11px]">
                  <span className="text-emerald-400">Nhận biết: {percentBloom.REMEMBER}% ({countByBloom.REMEMBER} câu)</span>
                  <span className="text-sky-400">Thông hiểu: {percentBloom.UNDERSTAND}% ({countByBloom.UNDERSTAND} câu)</span>
                  <span className="text-amber-400">Vận dụng: {percentBloom.APPLY}% ({countByBloom.APPLY} câu)</span>
                  <span className="text-rose-400">Vận dụng cao: {percentBloom.ANALYZE}% ({countByBloom.ANALYZE} câu)</span>
                </div>
              </div>

              {/* Progress Bar Visualizer */}
              <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${percentBloom.REMEMBER}%` }}
                  className="bg-emerald-500 h-full"
                  title={`Nhận biết: ${percentBloom.REMEMBER}%`}
                />
                <div
                  style={{ width: `${percentBloom.UNDERSTAND}%` }}
                  className="bg-sky-500 h-full"
                  title={`Thông hiểu: ${percentBloom.UNDERSTAND}%`}
                />
                <div
                  style={{ width: `${percentBloom.APPLY}%` }}
                  className="bg-amber-500 h-full"
                  title={`Vận dụng: ${percentBloom.APPLY}%`}
                />
                <div
                  style={{ width: `${percentBloom.ANALYZE}%` }}
                  className="bg-rose-500 h-full"
                  title={`Vận dụng cao: ${percentBloom.ANALYZE}%`}
                />
              </div>
            </div>

            {/* Criteria Matrix Table */}
            <div className="space-y-3 border-t border-slate-800 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 text-sm">
                  Chi tiết Chỉ tiêu Ma trận (Criteria Matrix)
                </span>
                {!bpIsLocked && (
                  <button
                    type="button"
                    onClick={handleAddCriterion}
                    className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold"
                  >
                    ➕ Thêm chỉ tiêu
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="py-2 px-3">Chủ đề (Topic Node)</th>
                      <th className="py-2 px-3">Mức độ Bloom</th>
                      <th className="py-2 px-3 w-28">Số lượng câu</th>
                      <th className="py-2 px-3 w-28">Điểm / câu</th>
                      <th className="py-2 px-3 w-28">Tổng điểm</th>
                      {!bpIsLocked && <th className="py-2 px-3 w-16 text-center">Xóa</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {bpCriteria.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Chưa có chỉ tiêu nào trong ma trận. Bấm &quot;Thêm chỉ tiêu&quot; để thiết lập.
                        </td>
                      </tr>
                    ) : (
                      bpCriteria.map((crit, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3">
                            <select
                              disabled={bpIsLocked}
                              value={crit.topicNodeId}
                              onChange={(e) => handleCriterionChange(idx, 'topicNodeId', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                            >
                              {topicNodes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <select
                              disabled={bpIsLocked}
                              value={crit.difficulty}
                              onChange={(e) =>
                                handleCriterionChange(idx, 'difficulty', e.target.value as QuestionDifficulty)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                            >
                              <option value="REMEMBER">Nhận biết (Remember)</option>
                              <option value="UNDERSTAND">Thông hiểu (Understand)</option>
                              <option value="APPLY">Vận dụng (Apply)</option>
                              <option value="ANALYZE">Vận dụng cao (Analyze)</option>
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="1"
                              disabled={bpIsLocked}
                              value={crit.questionCount}
                              onChange={(e) =>
                                handleCriterionChange(idx, 'questionCount', Math.max(1, Number(e.target.value)))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.25"
                              min="0.25"
                              disabled={bpIsLocked}
                              value={crit.pointsPerQuestion}
                              onChange={(e) =>
                                handleCriterionChange(idx, 'pointsPerQuestion', Number(e.target.value))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-200">
                            {Number(crit.questionCount || 0) * Number(crit.pointsPerQuestion || 0)} điểm
                          </td>
                          {!bpIsLocked && (
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCriterion(idx)}
                                className="text-slate-500 hover:text-rose-400 font-bold px-2 py-1"
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveBlueprintAssessment(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-all cursor-pointer"
              >
                Đóng
              </button>
              {!bpIsLocked && (
                <button
                  type="button"
                  disabled={savingBlueprint}
                  onClick={handleSaveBlueprint}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingBlueprint ? 'Đang lưu...' : '💾 Lưu Ma Trận Blueprint'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
