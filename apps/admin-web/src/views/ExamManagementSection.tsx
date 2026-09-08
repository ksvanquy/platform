import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/index.js';
import type {
  ExamDTO,
  ExamVariantSummary,
  SanitizedExamManifest,
  AssessmentDTO,
  AttemptDTO,
} from '@platform/contracts';

export const ExamManagementSection: React.FC = () => {
  const [exams, setExams] = useState<ExamDTO[]>([]);
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filter
  const [filterAssessmentId, setFilterAssessmentId] = useState<string>('');

  // Generate Exam Modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genAssessmentId, setGenAssessmentId] = useState('');
  const [genCode, setGenCode] = useState('');
  const [genTitle, setGenTitle] = useState('');
  const [genVariantsCount, setGenVariantsCount] = useState<number>(4);
  const [genDurationMinutes, setGenDurationMinutes] = useState<number>(45);
  const [genSeedBase, setGenSeedBase] = useState<number>(1000);
  const [generating, setGenerating] = useState(false);

  // Detail / Manifest Preview Modal
  const [activeExam, setActiveExam] = useState<ExamDTO | null>(null);
  const [previewManifest, setPreviewManifest] = useState<SanitizedExamManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [selectedVariantCode, setSelectedVariantCode] = useState<string>('DEFAULT');

  // Attempts Monitoring Modal
  const [showAttemptsModal, setShowAttemptsModal] = useState(false);
  const [examAttempts, setExamAttempts] = useState<AttemptDTO[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.exams.list(
        filterAssessmentId ? { assessmentId: filterAssessmentId } : undefined
      );
      if (res.success && res.data) {
        setExams(res.data);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải danh sách đề thi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filterAssessmentId]);

  const fetchAssessments = async () => {
    try {
      const res = await adminApi.assessments.list();
      if (res.success && res.data) {
        setAssessments(res.data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAssessments();
    fetchExams();
  }, [fetchExams]);

  const handleOpenGenerateModal = () => {
    const lockedAsms = assessments.filter((a) => a.currentBlueprint?.isLocked);
    const defaultAsm = lockedAsms[0] || assessments[0];
    setGenAssessmentId(defaultAsm?.id || '');
    setGenCode(`EXAM_${Date.now().toString(36).toUpperCase()}`);
    setGenTitle(defaultAsm ? `Kỳ thi: ${defaultAsm.title}` : 'Kỳ thi mới');
    setGenVariantsCount(4);
    setGenDurationMinutes(defaultAsm?.currentBlueprint?.durationMinutes || 45);
    setGenSeedBase(Math.floor(Math.random() * 9000) + 1000);
    setShowGenerateModal(true);
  };

  const handleGenerateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genAssessmentId) {
      setStatusMessage('⚠️ Vui lòng chọn Bài đánh giá (Assessment Blueprint) để sinh đề!');
      return;
    }
    if (!genCode.trim() || !genTitle.trim()) {
      setStatusMessage('⚠️ Vui lòng nhập đầy đủ Mã kỳ thi và Tiêu đề!');
      return;
    }

    setGenerating(true);
    setStatusMessage(null);
    try {
      const res = await adminApi.exams.generate({
        assessmentId: genAssessmentId,
        code: genCode.trim().toUpperCase(),
        title: genTitle.trim(),
        durationMinutes: Number(genDurationMinutes) || 45,
        variantsCount: Number(genVariantsCount) || 4,
        seedBase: Number(genSeedBase) || 1000,
      });

      if (res.success && res.data) {
        setStatusMessage(`✅ Đã sinh thành công Kỳ thi [${res.data.code}] với ${res.data.variantsCount || genVariantsCount} mã đề xáo trộn!`);
        setShowGenerateModal(false);
        await fetchExams();
      } else {
        setStatusMessage(`❌ Lỗi: ${res.message || 'Không thể sinh đề thi'}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi sinh đề: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePublish = async (exam: ExamDTO) => {
    try {
      if (exam.isPublished) {
        await adminApi.exams.unpublish(exam.id);
        setStatusMessage(`⏸️ Đã ngừng xuất bản kỳ thi [${exam.code}]!`);
      } else {
        await adminApi.exams.publish(exam.id);
        setStatusMessage(`🚀 Đã xuất bản kỳ thi [${exam.code}] cho thí sinh tham dự!`);
      }
      await fetchExams();
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi thao tác xuất bản: ${err.message}`);
    }
  };

  const handleDeleteExam = async (exam: ExamDTO) => {
    if (!confirm(`⚠️ BẠN CÓ CHẮC MUỐN XÓA KỲ THI [${exam.code}]?\nToàn bộ mã đề và snapshot bất biến sẽ bị hủy bỏ!`)) {
      return;
    }
    try {
      await adminApi.exams.delete(exam.id);
      setStatusMessage(`🗑️ Đã xóa kỳ thi [${exam.code}]!`);
      await fetchExams();
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi xóa kỳ thi: ${err.message}`);
    }
  };

  const handlePreviewManifest = async (exam: ExamDTO, variantCode: string = 'DEFAULT') => {
    setActiveExam(exam);
    setSelectedVariantCode(variantCode);
    setLoadingManifest(true);
    setPreviewManifest(null);
    try {
      const res = await adminApi.exams.getSanitizedManifest(exam.id, variantCode);
      if (res.success && res.data) {
        setPreviewManifest(res.data);
      } else {
        setStatusMessage(`⚠️ Không tìm thấy manifest cho mã đề ${variantCode}`);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải manifest đề thi: ${err.message}`);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handleViewAttempts = async (exam: ExamDTO) => {
    setActiveExam(exam);
    setShowAttemptsModal(true);
    setLoadingAttempts(true);
    try {
      const res = await adminApi.attempts.list({ examId: exam.id });
      if (res.success && res.data) {
        setExamAttempts(res.data);
      }
    } catch (err: any) {
      setStatusMessage(`❌ Lỗi tải danh sách ca thi: ${err.message}`);
    } finally {
      setLoadingAttempts(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>⚡</span>
            <span>Kỳ Thi & Bộ Mã Đề (Exam Service Engine)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sinh đề tự động từ ma trận Blueprint, giải nghiệm tổ hợp, sinh mã đề xáo trộn (PRNG Seed) & đóng băng Snapshot SHA-256
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchExams}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
          <button
            type="button"
            onClick={handleOpenGenerateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>✨</span>
            <span>Sinh Kỳ Thi Mới</span>
          </button>
        </div>
      </div>

      {/* Status feedback */}
      {statusMessage && (
        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-200 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <label className="text-xs font-medium text-slate-400">Lọc theo Ma trận Blueprint:</label>
        <select
          value={filterAssessmentId}
          onChange={(e) => setFilterAssessmentId(e.target.value)}
          className="bg-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Tất cả bài đánh giá</option>
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.title} {a.currentBlueprint?.isLocked ? '🔒' : '✏️'}
            </option>
          ))}
        </select>
      </div>

      {/* Exam Grid / Table */}
      {exams.length === 0 && !loading ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-dashed border-slate-800">
          <div className="text-3xl mb-3">📋</div>
          <p className="text-sm font-semibold text-slate-300">Chưa có kỳ thi nào được sinh</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Hãy chọn một Bài đánh giá (Assessment Blueprint) đã khóa ma trận và bấm &quot;Sinh Kỳ Thi Mới&quot; để tạo các mã đề xáo trộn tự động.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {exam.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          exam.isPublished
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {exam.isPublished ? '● Đang xuất bản' : '○ Bản nháp'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Status: <strong className="text-slate-200">{exam.status}</strong>
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-100 mt-2">{exam.title}</h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteExam(exam)}
                    className="text-slate-500 hover:text-rose-400 text-xs p-1 rounded hover:bg-slate-800 transition"
                    title="Xóa kỳ thi"
                  >
                    🗑️
                  </button>
                </div>

                {/* Metadata badges */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px]">
                  <div className="text-slate-400">
                    Thời lượng: <span className="font-semibold text-slate-200">{exam.durationMinutes}p</span>
                  </div>
                  <div className="text-slate-400">
                    Mã đề: <span className="font-semibold text-slate-200">{exam.variantsCount || exam.variants?.length || 1}</span>
                  </div>
                  <div className="text-slate-400">
                    Seed base: <span className="font-mono font-semibold text-slate-200">{exam.randomizationSeedBase}</span>
                  </div>
                </div>

                {/* Variants List Pill */}
                {exam.variants && exam.variants.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mã đề thi (SHA-256 Snapshots):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {exam.variants.map((v: ExamVariantSummary) => (
                        <button
                          key={v.variantCode}
                          type="button"
                          onClick={() => handlePreviewManifest(exam, v.variantCode)}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                          title={`Click để xem đề thi mã ${v.variantCode} (Hash: ${v.contentHash.substring(0, 8)}...)`}
                        >
                          <span>📄 Đề {v.variantCode}</span>
                          <span className="text-[9px] text-slate-400">({v.questionCount}q)</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handlePreviewManifest(exam, 'DEFAULT')}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-center cursor-pointer"
                >
                  👁️ Xem Đề Thi
                </button>
                <button
                  type="button"
                  onClick={() => handleViewAttempts(exam)}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-center cursor-pointer"
                >
                  👥 Ca Thi
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePublish(exam)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                    exam.isPublished
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {exam.isPublished ? 'Ngừng phát hành' : 'Xuất bản'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Sinh Kỳ Thi Mới */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>✨</span>
                <span>Sinh Kỳ Thi Mới từ Ma Trận Đề</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateExam} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Chọn Bài Đánh Giá (Blueprint) <span className="text-rose-400">*</span>:
                </label>
                <select
                  value={genAssessmentId}
                  onChange={(e) => {
                    setGenAssessmentId(e.target.value);
                    const selected = assessments.find((a) => a.id === e.target.value);
                    if (selected) {
                      setGenTitle(`Kỳ thi: ${selected.title}`);
                      setGenDurationMinutes(selected.currentBlueprint?.durationMinutes || 45);
                    }
                  }}
                  className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                >
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.title} ({a.currentBlueprint?.criteria?.length || 0} tiêu chí, {a.currentBlueprint?.isLocked ? '🔒 Đã khóa' : '⚠️ Chưa khóa'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Engine sẽ lấy câu hỏi hợp lệ từ Ngân hàng câu hỏi thỏa mãn ma trận Bloom & chủ đề của blueprint này.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mã kỳ thi (Code):</label>
                  <input
                    type="text"
                    value={genCode}
                    onChange={(e) => setGenCode(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Thời lượng (Phút):</label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={genDurationMinutes}
                    onChange={(e) => setGenDurationMinutes(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tiêu đề kỳ thi:</label>
                <input
                  type="text"
                  value={genTitle}
                  onChange={(e) => setGenTitle(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Số lượng mã đề xáo trộn:</label>
                  <select
                    value={genVariantsCount}
                    onChange={(e) => setGenVariantsCount(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1}>1 đề duy nhất (DEFAULT)</option>
                    <option value={2}>2 mã đề (101, 102)</option>
                    <option value={4}>4 mã đề (101 - 104)</option>
                    <option value={6}>6 mã đề (101 - 106)</option>
                    <option value={8}>8 mã đề (101 - 108)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Seed base xáo trộn:</label>
                  <input
                    type="number"
                    value={genSeedBase}
                    onChange={(e) => setGenSeedBase(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 text-[11px] space-y-1">
                <p className="font-semibold">🛡️ Cơ chế Bất biến & Chống lộ đáp án (Zero-Knowledge Manifest):</p>
                <p>
                  Mỗi mã đề sẽ được đóng băng thành một Snapshot có chữ ký SHA-256. Thí sinh chỉ nhận đề thi đã khử khuẩn không chứa cờ đáp án đúng.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  {generating ? 'Đang giải ma trận...' : '🚀 Bắt đầu Sinh Đề'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Preview Sanitized Manifest (Candidate Test Paper) */}
      {(previewManifest || loadingManifest) && activeExam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 my-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>📄</span>
                  <span>Đề Thi Khử Khuẩn (Sanitized Manifest) — Mã đề {selectedVariantCode}</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">{activeExam.title} [{activeExam.code}]</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewManifest(null);
                  setActiveExam(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {loadingManifest ? (
              <div className="p-8 text-center text-slate-400 text-xs">Đang nạp đề thi đã khử khuẩn...</div>
            ) : previewManifest ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                {/* Header Summary */}
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 grid grid-cols-4 gap-2 text-center text-slate-300">
                  <div>
                    <div className="text-[10px] text-slate-400">Thời lượng</div>
                    <div className="font-bold text-slate-100">{previewManifest.durationMinutes} phút</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Tổng số câu</div>
                    <div className="font-bold text-slate-100">{previewManifest.totalQuestions} câu</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Tổng điểm</div>
                    <div className="font-bold text-slate-100">{previewManifest.totalPoints} đ</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Bảo mật</div>
                    <div className="font-bold text-emerald-400">Zero Leak ✅</div>
                  </div>
                </div>

                {/* Questions Preview */}
                <div className="space-y-3">
                  {previewManifest.questions.map((q, idx) => (
                    <div key={q.id} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-indigo-300">Câu {idx + 1} ({q.points} điểm)</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">{q.type}</span>
                      </div>
                      <div className="text-slate-200 font-medium whitespace-pre-wrap">{q.prompt}</div>

                      {q.options && q.options.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {q.options.map((opt) => (
                            <div
                              key={opt.id}
                              className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 flex items-center gap-2"
                            >
                              <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-400">
                                {opt.id.charAt(0).toUpperCase()}
                              </span>
                              <span>{opt.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-emerald-400 font-medium">
                🔒 Đảm bảo không chứa đáp án đúng hoặc giải thích để ngăn chặn gian lận phía thí sinh.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewManifest(null);
                  setActiveExam(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Giám Thị Ca Thi (Proctoring & Attempts) */}
      {showAttemptsModal && activeExam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl p-6 shadow-2xl space-y-4 my-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>👥</span>
                  <span>Danh Sách Ca Thi & Giám Thị — [{activeExam.code}]</span>
                </h3>
                <p className="text-[11px] text-slate-400">{activeExam.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAttemptsModal(false);
                  setActiveExam(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {loadingAttempts ? (
              <div className="p-8 text-center text-slate-400 text-xs">Đang tải danh sách ca thi...</div>
            ) : examAttempts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Chưa có thí sinh nào bắt đầu làm bài thi này.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="pb-2">Mã ca thi</th>
                      <th className="pb-2">Thí sinh</th>
                      <th className="pb-2">Mã đề</th>
                      <th className="pb-2">Trạng thái</th>
                      <th className="pb-2">Điểm số</th>
                      <th className="pb-2">Thời gian nộp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {examAttempts.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 font-mono text-[11px] text-indigo-400">{att.id.substring(0, 12)}...</td>
                        <td className="py-2.5 font-semibold text-slate-200">{att.userId}</td>
                        <td className="py-2.5 font-mono text-slate-300">{att.variantCode || 'DEFAULT'}</td>
                        <td className="py-2.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              att.status === 'SUBMITTED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : att.status === 'IN_PROGRESS'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                : att.status === 'EXPIRED'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : 'bg-slate-700/50 text-slate-300 border-slate-600'
                            }`}
                          >
                            {att.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-slate-100">
                          {att.scoreResult ? `${att.scoreResult.score} / ${att.scoreResult.maxScore} (${att.scoreResult.percentage}%)` : '—'}
                        </td>
                        <td className="py-2.5 text-[11px] text-slate-400">
                          {att.submittedAt ? new Date(att.submittedAt).toLocaleTimeString() : 'Chưa nộp'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAttemptsModal(false);
                  setActiveExam(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
